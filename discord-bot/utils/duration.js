/**
 * duration.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart duration parser shared by x!timeout and x!mute.
 *
 * Accepts:
 *   - A bare number         → treated as minutes (keeps old behaviour working)
 *   - Shorthand units       → 30s, 10m, 2h, 1d, 1w
 *   - Full words            → "30 seconds", "10 minutes", "2 hours", "1 day", "1 week"
 *   - Combined shorthand    → 1d12h, 2h30m, 1w2d, 1d 30m
 *
 * Examples that all resolve correctly:
 *   x!timeout @user 10          → 10 minutes (legacy behaviour)
 *   x!timeout @user 10m         → 10 minutes
 *   x!timeout @user 2h          → 2 hours
 *   x!timeout @user 1d          → 1 day
 *   x!timeout @user 1w          → 1 week
 *   x!timeout @user 1d12h       → 1 day 12 hours
 *   x!timeout @user 2 hours     → 2 hours
 * ─────────────────────────────────────────────────────────────────────────────
 */

const UNIT_MS = {
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60 * 1000, min: 60 * 1000, mins: 60 * 1000, minute: 60 * 1000, minutes: 60 * 1000,
  h: 60 * 60 * 1000, hr: 60 * 60 * 1000, hrs: 60 * 60 * 1000, hour: 60 * 60 * 1000, hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000, day: 24 * 60 * 60 * 1000, days: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, weeks: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parses a duration string (or several args already joined with spaces).
 * Returns { ms, text } on success, or null if nothing usable was found.
 */
function parseDuration(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;

  // Bare number → minutes (backwards compatible with the old x!timeout @user <minutes>)
  if (/^\d+$/.test(raw)) {
    const minutes = parseInt(raw, 10);
    const ms = minutes * UNIT_MS.m;
    return { ms, text: formatMs(ms) };
  }

  const regex = /(\d+)\s*([a-z]+)/g;
  let match;
  let totalMs = 0;
  let matchedAnything = false;

  while ((match = regex.exec(raw)) !== null) {
    const value = parseInt(match[1], 10);
    const unitMs = UNIT_MS[match[2]];
    if (!unitMs) continue; // ignore unrecognized trailing words instead of hard failing
    totalMs += value * unitMs;
    matchedAnything = true;
  }

  if (!matchedAnything || totalMs <= 0) return null;
  return { ms: totalMs, text: formatMs(totalMs) };
}

/** Turns a millisecond duration into a short human-readable string, e.g. "1d 2h 5m". */
function formatMs(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const weeks = Math.floor(totalMinutes / (60 * 24 * 7));
  const days = Math.floor((totalMinutes % (60 * 24 * 7)) / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (weeks) parts.push(`${weeks}w`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

module.exports = { parseDuration, formatMs };
