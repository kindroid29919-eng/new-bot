// Fetches a random anime GIF from the nekos.best API for a given category.
// nekos.best generates a fresh random result per request (no fixed pool of
// URLs to hardcode), so we call it live and just fall back gracefully if
// the request fails or times out, so a command never breaks because of it.

const BASE_URL = 'https://nekos.best/api/v2';

/**
 * @param {string} category one of: hug, kiss, pat, poke, slap (etc.)
 * @param {number} timeoutMs
 * @returns {Promise<{ url: string, anime_name?: string } | null>}
 */
async function getGif(category, timeoutMs = 6000) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${BASE_URL}/${category}?amount=1`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'social-commands-bot/1.0 (discord)' },
      });

      if (!res.ok) {
        console.error(`[nekosGif] ${category} returned HTTP ${res.status} (attempt ${attempt})`);
        clearTimeout(timeout);
        continue; // try again once before giving up
      }

      const data = await res.json();
      const result = data?.results?.[0];
      if (!result?.url) {
        console.error(`[nekosGif] ${category} response had no results (attempt ${attempt}):`, JSON.stringify(data));
        clearTimeout(timeout);
        continue;
      }

      clearTimeout(timeout);
      return {
        url: result.url,
        anime_name: result.anime_name,
        artist_name: result.artist_name,
        artist_href: result.artist_href,
        source_url: result.source_url,
      };
    } catch (err) {
      // Log the REAL reason (timeout/abort, DNS failure, fetch not defined, etc.)
      // instead of failing silently, so it's actually debuggable from the console.
      console.error(`[nekosGif] ${category} fetch failed (attempt ${attempt}):`, err.name, err.message);
      clearTimeout(timeout);
    }
  }

  return null; // both attempts failed — caller falls back to text-only
}

module.exports = { getGif };
