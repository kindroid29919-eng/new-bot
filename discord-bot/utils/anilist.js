// AniList GraphQL client — pulls real, named anime/manga characters with
// official art and a genuine popularity signal (favourites count).
// No API key required. Docs: https://docs.anilist.co/

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

  console.error(
    `[anilist] getRandomCharacter gave up after exhausting all page stops. ` +
    `opts=${JSON.stringify(opts)} pages tried: ${triedPages.join(', ')}`,
  );

  return null; // gave up — caller should handle gracefully
}

module.exports = {
  getRandomCharacter,
  tierFor,
  // cache utilities
  getCharacterFromCache,
  cacheStats,
  clearCache,
};
