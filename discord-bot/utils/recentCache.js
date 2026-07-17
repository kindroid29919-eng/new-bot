/**
 * recentCache.js
 * Tracks the last N results per command key so the bot avoids
 * repeating the exact same combination back-to-back.
 *
 * Usage:
 *   const { avoidRepeat } = require('./recentCache');
 *   const result = avoidRepeat('crime', () => buildResult(), 10);
 */

const cache = new Map(); // commandKey → string[]

/**
 * Call `builder()` up to `maxAttempts` times and return the first result
 * that isn't in the recent history for `key`.  If all attempts collide,
 * the last generated value is returned anyway (prevents infinite loops).
 *
 * @param {string}   key         – unique key per command (e.g. 'crime', 'wanted')
 * @param {Function} builder     – () => string  (builds the composite result)
 * @param {number}   [history=10]  – how many past results to remember
 * @param {number}   [maxAttempts=25]
 * @returns {string}
 */
function avoidRepeat(key, builder, history = 10, maxAttempts = 25) {
  const seen = cache.get(key) ?? [];
  let result;
  let attempts = 0;

  do {
    result = builder();
    attempts++;
  } while (seen.includes(result) && attempts < maxAttempts);

  seen.push(result);
  if (seen.length > history) seen.shift();
  cache.set(key, seen);

  return result;
}

module.exports = { avoidRepeat };
