// AniList GraphQL client — pulls real, named anime/manga characters with
// official art and a genuine popularity signal (favourites count), instead
// of the anonymous fanart that art-aggregator APIs (nekos.best, waifu.pics
// etc.) return. No API key required.
//
// Docs: https://docs.anilist.co/

const ANILIST_URL = 'https://graphql.anilist.co';

// We only need this for identifying the app in error logs — AniList doesn't
// require it, but it's good practice and costs nothing.
const USER_AGENT = 'Expose-Bot (ahadsg26@gmail.com)';

// Pool size: how many of the top-favourited characters we draw from.
// Keeps pulls to characters people actually recognize, while still being
// a big enough pool to span all five rarity tiers.
const POOL_SIZE = 4000;
const PER_PAGE = 25;
const MAX_PAGE = Math.ceil(POOL_SIZE / PER_PAGE);

const QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    characters(sort: FAVOURITES_DESC) {
      id
      name { full native }
      image { large }
      favourites
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

/**
 * Fetches one random character from the top-POOL_SIZE most-favourited
 * AniList characters.
 * @returns {Promise<{id:number,name:string,image:string,favourites:number,
 *   source:string,mediaType:string,tier:{name:string,emoji:string}}|null>}
 */
async function getRandomCharacter() {
  const page = Math.floor(Math.random() * MAX_PAGE) + 1;

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
      console.error(`[anilist] HTTP ${res.status} fetching character page ${page}`);
      return null;
    }

    const data = await res.json();
    const list = data?.data?.Page?.characters ?? [];
    if (!list.length) {
      console.error('[anilist] empty character list', JSON.stringify(data));
      return null;
    }

    const c = list[Math.floor(Math.random() * list.length)];
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
  } catch (err) {
    clearTimeout(timeout);
    console.error('[anilist] fetch failed:', err.name, err.message);
    return null;
  }
}

module.exports = { getRandomCharacter, tierFor };
