// AniList GraphQL client — pulls real, named anime/manga characters with
// official art and a genuine popularity signal (favourites count).
// No API key required. Docs: https://docs.anilist.co/

const fs   = require('fs');
const path = require('path');

const ANILIST_URL = 'https://graphql.anilist.co';
const USER_AGENT  = 'Expose-Bot (ahadsg26@gmail.com)';

const POOL_SIZE = 4000;
const PER_PAGE  = 25;
const MAX_PAGE  = Math.ceil(POOL_SIZE / PER_PAGE);

// Filters out characters too obscure to feel like a "real" pull.
const MIN_FAVOURITES = 20;

// Approximate favourites distribution across AniList sorted by FAVOURITES_DESC:
//   pages  1–4   → top ~100  chars → almost all Legendary  (≥50 000 favs)
//   pages  1–24  → top ~600  chars → Epic+ reliably        (≥15 000 favs)
//   pages  1–80  → top ~2000 chars → Rare+ reliably        (≥5 000 favs)
//   pages  1–160 → full pool
const PAGE_RANGE = {
  legendary:     Math.ceil(100  / PER_PAGE),  //  4 pages
  epicOrBetter:  Math.ceil(600  / PER_PAGE),  // 24 pages
  rareOrBetter:  Math.ceil(2000 / PER_PAGE),  // 80 pages
  all:           MAX_PAGE,
};

// ── Base pull rates (no pity active) ─────────────────────────────────────────
// These are EXPLICIT weights so tier frequency is controlled independently of
// the AniList page distribution. Without this, randomly picking from 1–160
// pages makes Epic appear ~15% of the time (pages 1–24 / 160 total) instead
// of the intended ~4%, and Common almost never appears.
const BASE_RATES = [
  { tier: 'Legendary', weight:  1 },
  { tier: 'Epic',      weight:  4 },
  { tier: 'Rare',      weight: 15 },
  { tier: 'Uncommon',  weight: 30 },
  { tier: 'Common',    weight: 50 },
];
const BASE_TOTAL = BASE_RATES.reduce((s, r) => s + r.weight, 0);

function rollBaseTier() {
  let r = Math.random() * BASE_TOTAL;
  for (const { tier, weight } of BASE_RATES) {
    r -= weight;
    if (r <= 0) return tier;
  }
  return 'Common';
}

// Page ranges to search for each tier on a normal (non-pity) pull.
// These map to where AniList FAVOURITES_DESC naturally concentrates each tier.
const TIER_SEARCH = {
  Legendary: { minPage: 1,   maxPage: 4   },
  Epic:      { minPage: 5,   maxPage: 24  }, // skip legendary pages 1-4
  Rare:      { minPage: 24,  maxPage: 80  },
  Uncommon:  { minPage: 80,  maxPage: 130 },
  Common:    { minPage: 130, maxPage: MAX_PAGE },
};

const QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    characters(sort: FAVOURITES_DESC) {
      id
      name { full native }
      image { large }
      favourites
      gender
      media(perPage: 1, sort: POPULARITY_DESC) {
        nodes { title { romaji english } type }
      }
    }
  }
}`;

function tierFor(favourites) {
  if (favourites >= 50000) return { name: 'Legendary', emoji: '🌟' };
  if (favourites >= 15000) return { name: 'Epic',      emoji: '💎' };
  if (favourites >= 5000)  return { name: 'Rare',      emoji: '🔥' };
  if (favourites >= 1000)  return { name: 'Uncommon',  emoji: '✨' };
  return                          { name: 'Common',    emoji: '⚪' };
}

const RARE_OR_BETTER  = new Set(['Rare', 'Epic', 'Legendary']);
const EPIC_OR_BETTER  = new Set(['Epic', 'Legendary']);

// ---------------------------------------------------------------------------
// Local cache
// ---------------------------------------------------------------------------
// Two layers:
//   1. pageCache      — raw AniList page responses, keyed by page number.
//                        Since restrictive tiers (e.g. legendary) only ever
//                        draw from a handful of pages, this alone removes
//                        the vast majority of repeat network calls.
//   2. characterCache — individual parsed characters keyed by id, so any
//                        re-roll that lands on a previously-seen character
//                        (by id) is served with zero network I/O and zero
//                        re-parsing, regardless of which page it came from.
//
// Both are plain in-memory Maps here. Swap the get/set/has bodies below for
// calls into your own DB (Redis, Postgres, etc.) if you need persistence
// across process restarts — the rest of the module doesn't need to change.

const PAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — favourites drift slowly

const pageCache = new Map();      // page -> { characters: raw[], fetchedAt }
const characterCache = new Map(); // id   -> parsed character object

// Tracks pages that are currently rate-limited: page -> { until: timestamp }
// Stale cache is served for rate-limited pages instead of hitting AniList again.
const rateLimitedUntil = new Map();

/**
 * @param {number} page
 * @param {boolean} [allowStale=false] — return cached data even if TTL has expired
 */
function getCachedPage(page, allowStale = false) {
  const entry = pageCache.get(page);
  if (!entry) return null;
  const expired = Date.now() - entry.fetchedAt > PAGE_CACHE_TTL_MS;
  if (expired && !allowStale) {
    pageCache.delete(page);
    return null;
  }
  return entry.characters;
}

function setCachedPage(page, characters) {
  pageCache.set(page, { characters, fetchedAt: Date.now() });
}

function cacheCharacter(character) {
  characterCache.set(character.id, character);
}

/**
 * Look up a previously-pulled character by id with zero AniList requests.
 * Returns null if it hasn't been seen (i.e. cache miss) — caller can decide
 * whether to fall back to a fresh pull.
 */
function getCharacterFromCache(id) {
  return characterCache.get(id) || null;
}

function cacheStats() {
  return { pages: pageCache.size, characters: characterCache.size };
}

function clearCache() {
  pageCache.clear();
  characterCache.clear();
}

// ---------------------------------------------------------------------------
// Local Legendary supplement (BUG 2 FIX)
// ---------------------------------------------------------------------------
// Root cause of "Legendary pool is never being selected":
//   Pages 1-4 (100 characters) are AniList's global top-100 by favourites,
//   across ALL genders. Once that's narrowed to `gender === 'Female'`, the
//   surviving pool is tiny — sometimes zero — because most globally
//   top-favourited characters are male leads/protagonists. requireLegendary
//   pulls were therefore failing almost every time, which is what forced the
//   old code down the "fall back to Epic" path.
//
// Per product requirement, page count must stay capped at 4 (no wider
// AniList fetch). Instead, known-good Legendary female characters can be
// stored locally (id/name/image/source) and are merged in as a supplemental
// pool whenever the AniList-sourced pool for pages 1-4 doesn't have enough
// (or any) candidates. This guarantees requireLegendary pulls can always
// succeed without touching pagination and without ever substituting a
// lower tier.
//
// File format — data/legendary-local.json (ships as `[]`; see
// data/legendary-local.example.json for the shape):
//   [{ "id": 900001, "name": "...", "image": "https://...",
//      "source": "...", "favourites": 50000, "mediaType": "ANIME" }]
// Use ids outside AniList's real id space (e.g. 900000+) so a locally
// added character can never collide with a real AniList character id.
const LOCAL_LEGENDARY_PATH = path.join(__dirname, '..', 'data', 'legendary-local.json');

let localLegendaryCache = null;

function loadLocalLegendary() {
  if (localLegendaryCache) return localLegendaryCache;
  try {
    const raw = fs.readFileSync(LOCAL_LEGENDARY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    localLegendaryCache = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[anilist] failed to load local legendary pool:', err.message);
    }
    localLegendaryCache = [];
  }
  return localLegendaryCache;
}

/** Exposed so an admin command can force a reload after editing the JSON file. */
function reloadLocalLegendary() {
  localLegendaryCache = null;
  return loadLocalLegendary();
}

function getLocalLegendaryCandidates(excludeIds) {
  return loadLocalLegendary()
    .filter(c => !excludeIds || !excludeIds.has(c.id))
    .map(c => ({
      id:         c.id,
      name:       c.name,
      image:      c.image,
      favourites: c.favourites ?? 50000,
      source:     c.source ?? 'Unknown',
      mediaType:  c.mediaType ?? 'ANIME',
      tier:       { name: 'Legendary', emoji: '🌟' },
    }));
}

/**
 * Returns a Set of all real AniList IDs present in the local legendary pool.
 * These characters are managed exclusively through the local pool — they must
 * never be returned by a normal AniList page fetch, even if they happen to
 * appear on those pages at their real (non-Legendary) tier.
 */
function getLocalLegendaryIds() {
  return new Set(loadLocalLegendary().map(c => c.id));
}

// ---------------------------------------------------------------------------

async function fetchPage(page) {
  // If this page is currently rate-limited, serve stale cache rather than
  // hammering AniList again — this is the primary fix for the legendary-pity
  // stuck-loop bug where pages 1–4 kept getting 429 but were never cached.
  const rl = rateLimitedUntil.get(page);
  if (rl && Date.now() < rl) {
    return getCachedPage(page, true) ?? []; // stale or empty — don't hit API
  }

  const cached = getCachedPage(page);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        'User-Agent':   USER_AGENT,
      },
      body: JSON.stringify({ query: QUERY, variables: { page, perPage: PER_PAGE } }),
    });
    clearTimeout(timeout);

    const retryAfter    = res.headers.get('retry-after');
    const rlRemaining   = res.headers.get('x-ratelimit-remaining');
    const isRateLimited = res.status === 429 ||
      (rlRemaining !== null && Number(rlRemaining) <= 0);

    if (isRateLimited || retryAfter) {
      const cooldownSec = Number(retryAfter) || 60;
      rateLimitedUntil.set(page, Date.now() + cooldownSec * 1000);
      console.warn(
        `[anilist] rate-limited on page ${page}: status=${res.status} ` +
        `retry-after=${retryAfter ?? 'n/a'} remaining=${rlRemaining ?? 'n/a'} ` +
        `— backing off ${cooldownSec}s, serving stale cache if available`,
      );
      // Serve stale cache so the pull doesn't fail outright
      return getCachedPage(page, true) ?? [];
    }

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      console.error(`[anilist] HTTP ${res.status} fetching page ${page}: ${body.slice(0, 300)}`);
      return [];
    }

    const data = await res.json();

    // AniList can return 200 OK with a GraphQL-level error payload (bad query,
    // complexity limit, degraded rate-limiting, etc). Without this check these
    // failures were silent: characters would just come back empty with no log.
    if (data?.errors?.length) {
      console.error(
        `[anilist] GraphQL error(s) on page ${page}: ` +
        data.errors.map(e => e.message).join(' | '),
      );
      return [];
    }

    const characters = data?.data?.Page?.characters ?? [];
    if (!characters.length) {
      console.warn(`[anilist] page ${page} returned 0 characters (unexpected empty payload)`);
    } else {
      setCachedPage(page, characters);
    }
    return characters;
  } catch (err) {
    clearTimeout(timeout);
    console.error('[anilist] fetch failed:', err.name, err.message);
    return [];
  }
}

function toCharacter(c) {
  const media = c.media?.nodes?.[0];
  return {
    id:        c.id,
    name:      c.name?.full || c.name?.native || 'Unknown',
    image:     c.image?.large,
    favourites: c.favourites ?? 0,
    source:    media?.title?.english || media?.title?.romaji || 'Unknown',
    mediaType: media?.type || 'ANIME',
    tier:      tierFor(c.favourites ?? 0),
  };
}

/**
 * Pull a single random character matching the requested tier constraint.
 *
 * @param {object}  opts
 * @param {boolean} [opts.requireLegendary]     — force Legendary (100-pull pity)
 * @param {boolean} [opts.requireEpicOrBetter]  — force Epic+ (50-pull pity)
 * @param {boolean} [opts.requireRareOrBetter]  — force Rare+ (30-pull pity)
 * @param {Set<number>|null} [excludeIds=null]  — character ids already pulled this session (dedup)
 * @param {number}  [maxAttempts=15]
 * @returns {Promise<object|null>}
 */
async function getRandomCharacter(opts = {}, excludeIds = null, maxAttempts = 15) {
  const {
    requireLegendary    = false,
    requireEpicOrBetter = false,
    requireRareOrBetter = false,
  } = opts;

  // Characters in the local legendary pool are managed exclusively there.
  // Even if they appear on AniList pages at their real (non-Legendary) tier,
  // we must never return them from a normal API pull — they'd show at the
  // wrong tier (Rare/Epic) and undercut the local pool logic.
  const localLegendaryIds = getLocalLegendaryIds();

  // Determine search scope and acceptance filter (most → least restrictive)
  // `pageStops` is an escalation ladder: try the narrow, fast page range
  // first; if it comes up empty, widen the search before giving up. This
  // matters most for hard-pity pulls (requireLegendary etc.) — without an
  // escalation path, a user who exhausts the narrow range gets `null`,
  // their pity counter never resets, and they get stuck retrying the same
  // narrow (and apparently empty) range forever.
  let pageStops, tierFilter;

  if (requireLegendary) {
    // Legendary chars live exclusively on pages 1–4 (sorted by FAVOURITES_DESC).
    // Escalating to wider page ranges with a Legendary filter is pointless —
    // those pages never contain Legendary characters and only burn rate-limit
    // budget, which is exactly what caused the stuck-at-100-pulls loop.
    pageStops  = [PAGE_RANGE.legendary];
    tierFilter = c => c.tier.name === 'Legendary';
  } else if (requireEpicOrBetter) {
    pageStops  = [PAGE_RANGE.epicOrBetter, PAGE_RANGE.rareOrBetter, PAGE_RANGE.all];
    tierFilter = c => EPIC_OR_BETTER.has(c.tier.name);
  } else if (requireRareOrBetter) {
    pageStops  = [PAGE_RANGE.rareOrBetter, PAGE_RANGE.all];
    tierFilter = c => RARE_OR_BETTER.has(c.tier.name);
  } else {
    pageStops  = [PAGE_RANGE.all];
    tierFilter = () => true;
  }

  const triedPages = [];
  const perStopAttempts = Math.max(1, Math.ceil(maxAttempts / pageStops.length));

  for (const maxPage of pageStops) {
    for (let attempt = 0; attempt < perStopAttempts; attempt++) {
      const page = Math.floor(Math.random() * maxPage) + 1;
      const raw  = await fetchPage(page); // served from pageCache when available

      if (!raw.length) {
        triedPages.push(`${page}:empty`);
        continue;
      }

      const candidates = raw
        .filter(c => c.gender === 'Female')
        .filter(c => (c.favourites ?? 0) >= MIN_FAVOURITES)
        .filter(c => !localLegendaryIds.has(c.id))          // never from API — local pool only
        .filter(c => !excludeIds || !excludeIds.has(c.id))
        .map(toCharacter)
        .filter(tierFilter);

      if (candidates.length) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        cacheCharacter(picked); // store so future re-rolls of this id are free
        return picked;
      }

      triedPages.push(`${page}:no-match(${raw.length} raw)`);
    }
  }

  // BUG 2 FIX: AniList pages 1-4 exhausted with no Female Legendary match.
  // Before giving up, check the locally-stored supplemental Legendary pool.
  // This is scoped to requireLegendary only — it must never engage for
  // other tiers, and it must never substitute a different tier.
  if (requireLegendary) {
    const localCandidates = getLocalLegendaryCandidates(excludeIds);
    if (localCandidates.length) {
      const picked = localCandidates[Math.floor(Math.random() * localCandidates.length)];
      cacheCharacter(picked);
      console.warn(
        '[anilist] Legendary served from local supplemental pool ' +
        '(AniList pages 1-4 had no unseen Female Legendary match)',
      );
      return picked;
    }
  }

  console.error(
    `[anilist] getRandomCharacter gave up after exhausting all page stops` +
    `${requireLegendary ? ' and the local Legendary supplement' : ''}. ` +
    `opts=${JSON.stringify(opts)} pages tried: ${triedPages.join(', ')}`,
  );

  return null; // gave up — caller should handle gracefully (refund, not a tier downgrade)
}

module.exports = {
  getRandomCharacter,
  tierFor,
  // cache utilities
  getCharacterFromCache,
  cacheStats,
  clearCache,
  // local legendary supplement
  reloadLocalLegendary,
};
