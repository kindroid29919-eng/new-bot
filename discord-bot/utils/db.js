// Postgres connection + schema setup for the waifu/harem game.
// Uses Railway's Postgres addon — DATABASE_URL is injected automatically
// as an environment variable once you attach it in the Railway dashboard.

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error(
    '[db] DATABASE_URL is not set.\n' +
      '     Add a Postgres addon on Railway and reference its DATABASE_URL\n' +
      '     in this service\'s Variables tab.',
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.internal')
    ? false
    : { rejectUnauthorized: false },
});

const MAX_HAREM_SIZE = 8;

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS harem (
      id              SERIAL PRIMARY KEY,
      user_id         TEXT NOT NULL,
      character_id    INTEGER NOT NULL,
      character_name  TEXT NOT NULL,
      source_title    TEXT,
      image_url       TEXT,
      tier            TEXT NOT NULL,
      favourites      INTEGER NOT NULL DEFAULT 0,
      married_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS waifu_pulls (
      id       SERIAL PRIMARY KEY,
      user_id  TEXT NOT NULL,
      pulled_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS waifu_pity (
      user_id           TEXT PRIMARY KEY,
      pulls_since_epic   INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_harem_user ON harem(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pulls_user_time ON waifu_pulls(user_id, pulled_at);`);

  console.log('[db] schema ready (harem, waifu_pulls, waifu_pity)');
}

// ── Rate limiting: max 10 pulls per rolling hour ────────────────────────────
async function pullsInLastHour(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM waifu_pulls
     WHERE user_id = $1 AND pulled_at > now() - interval '1 hour'`,
    [userId],
  );
  return rows[0].count;
}

async function logPull(userId) {
  await pool.query('INSERT INTO waifu_pulls (user_id) VALUES ($1)', [userId]);
}

async function minutesUntilNextSlot(userId) {
  const { rows } = await pool.query(
    `SELECT pulled_at FROM waifu_pulls
     WHERE user_id = $1 AND pulled_at > now() - interval '1 hour'
     ORDER BY pulled_at ASC LIMIT 1`,
    [userId],
  );
  if (!rows.length) return 0;
  const msRemaining = new Date(rows[0].pulled_at).getTime() + 60 * 60 * 1000 - Date.now();
  return Math.max(1, Math.ceil(msRemaining / 60000));
}

// ── Pity system: hard pity at 50 pulls since last Epic+ ────────────────────
async function getPity(userId) {
  const { rows } = await pool.query(
    'SELECT pulls_since_epic FROM waifu_pity WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.pulls_since_epic ?? 0;
}

async function bumpPity(userId, gotEpicOrBetter) {
  const next = gotEpicOrBetter ? 0 : (await getPity(userId)) + 1;
  await pool.query(
    `INSERT INTO waifu_pity (user_id, pulls_since_epic) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET pulls_since_epic = $2`,
    [userId, next],
  );
  return next;
}

// ── Harem ────────────────────────────────────────────────────────────────
async function countHarem(userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM harem WHERE user_id = $1',
    [userId],
  );
  return rows[0].count;
}

async function addToHarem(userId, character) {
  await pool.query(
    `INSERT INTO harem (user_id, character_id, character_name, source_title, image_url, tier, favourites)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      userId,
      character.id,
      character.name,
      character.source,
      character.image,
      character.tier.name,
      character.favourites,
    ],
  );
}

// Ordered consistently (tier, then favourites) so the numbers shown in
// x!harem line up with what x!view / x!unmarry expect.
async function getHarem(userId) {
  const { rows } = await pool.query(
    `SELECT id, character_name, source_title, image_url, tier, favourites, married_at
     FROM harem WHERE user_id = $1
     ORDER BY
       CASE tier
         WHEN 'Legendary' THEN 1
         WHEN 'Epic' THEN 2
         WHEN 'Rare' THEN 3
         WHEN 'Uncommon' THEN 4
         ELSE 5
       END,
       favourites DESC`,
    [userId],
  );
  return rows;
}

async function removeFromHarem(userId, haremRowId) {
  const { rowCount } = await pool.query(
    'DELETE FROM harem WHERE user_id = $1 AND id = $2',
    [userId, haremRowId],
  );
  return rowCount > 0;
}

module.exports = {
  pool,
  init,
  MAX_HAREM_SIZE,
  pullsInLastHour,
  logPull,
  minutesUntilNextSlot,
  getPity,
  bumpPity,
  countHarem,
  addToHarem,
  getHarem,
  removeFromHarem,
};
