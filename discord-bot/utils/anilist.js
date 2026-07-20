// AniList GraphQL client — pulls real, named anime/manga characters with
// official art and a genuine popularity signal (favourites count).
// No API key required. Docs: https://docs.anilist.co/

const ANILIST_URL = 'https://graphql.anilist.co';
const USER_AGENT = 'Expose-Bot (ahadsg26@gmail.com)';

const POOL_SIZE = 4000;
const PER_PAGE = 25;
const MAX_PAGE = Math.ceil(POOL_SIZE / PER_PAGE);

// Filters out characters too obscure to feel like a "real" pull.
const MIN_FAVOURITES = 20;

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
  if (favourites >= 15000) return { name: 'Epic', emoji: '💎' };
  if (favourites >= 5000)  return { name: 'Rare', emoji: '🔥' };
  if (favourites >= 1000)  return { name: 'Uncommon', emoji: '✨' };
  return { name: 'Common', emoji: '⚪' };
}

const EPIC_OR_BETTER = new Set(['Epic', 'Legendary']);

async function fetchPage(page) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ query: QUERY, variables: { page, perPage: PER_PAGE } }),
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[anilist] HTTP ${res.status} fetching page ${page}`);
      return [];
    }
    const data = await res.json();
    return data?.data?.Page?.characters ?? [];
  } catch (err) {
    clearTimeout(timeout);
    console.error('[anilist] fetch failed:', err.name, err.message);
    return [];
  }
}

function toCharacter(c) {
  const media = c.media?.nodes?.[0];
  return {
    id: c.id,
    name: c.name?.full || c.name?.native || 'Unknown',
    image: c.image?.large,
    favourites: c.favourites ?? 0,
    source: media?.title?.english || media?.title?.romaji || 'Unknown',
    mediaType: media?.type || 'ANIME',
    tier: tierFor(c.favourites ?? 0),
  };
}

/**
 * Pulls a random character matching filters.
 * @param {{ requireEpicOrBetter?: boolean }} opts
 * @param {number} maxAttempts
 */
async function getRandomCharacter(opts = {}, maxAttempts = 15) {
  const { requireEpicOrBetter = false } = opts;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Pity pulls search a smaller, higher-favourites page range so we don't
    // waste attempts scanning pages full of Common/Uncommon characters.
    const page = requireEpicOrBetter
      ? Math.floor(Math.random() * Math.ceil(600 / PER_PAGE)) + 1 // top ~600 by favourites
      : Math.floor(Math.random() * MAX_PAGE) + 1;

    const raw = await fetchPage(page);
    if (!raw.length) continue;

    const candidates = raw
      .filter(c => c.gender === 'Female')
      .filter(c => (c.favourites ?? 0) >= MIN_FAVOURITES)
      .map(toCharacter)
      .filter(c => !requireEpicOrBetter || EPIC_OR_BETTER.has(c.tier.name));

    if (candidates.length) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  return null; // gave up after maxAttempts — caller should handle gracefully
}

module.exports = { getRandomCharacter, tierFor };
