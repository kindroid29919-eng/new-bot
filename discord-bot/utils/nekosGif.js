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
async function getGif(category, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}/${category}?amount=1`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'social-commands-bot/1.0 (discord)' },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.results?.[0];
    if (!result?.url) return null;

    return { url: result.url, anime_name: result.anime_name };
  } catch (err) {
    // Network error, timeout, or bad JSON — fail silently and let the
    // caller fall back to a text-only embed.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getGif };
