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

  // ── Petals (currency) ─────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS currency (
      user_id    TEXT PRIMARY KEY,
      balance    INTEGER NOT NULL DEFAULT 0,
      streak     INTEGER NOT NULL DEFAULT 0,
      last_daily TIMESTAMPTZ
    );
  `);

  // ── Duel history ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS duel_log (
      id           SERIAL PRIMARY KEY,
      winner_id    TEXT NOT NULL,
      loser_id     TEXT NOT NULL,
      winner_char  TEXT NOT NULL,
      loser_char   TEXT NOT NULL,
      turns_taken  INTEGER NOT NULL,
      payout       INTEGER NOT NULL DEFAULT 0,
      ended_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ── Shop purchases (one-per-user per item) ────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_purchases (
      user_id      TEXT NOT NULL,
      shop_item_id INTEGER NOT NULL,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, shop_item_id)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_harem_user ON harem(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pulls_user_time ON waifu_pulls(user_id, pulled_at);`);

  console.log('[db] schema ready (harem, waifu_pulls, waifu_pity, currency, duel_log, shop_purchases)');
}

// ── Rate limiting (kept for backwards compat, no longer used for waifu) ────
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

// ── Harem ─────────────────────────────────────────────────────────────────
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
    `SELECT id, character_id, character_name, source_title, image_url, tier, favourites, married_at
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

// Transfer a harem character from one user to another (for trades)
async function transferHaremEntry(haremRowId, fromUserId, toUserId) {
  const { rowCount } = await pool.query(
    `UPDATE harem SET user_id = $1 WHERE id = $2 AND user_id = $3`,
    [toUserId, haremRowId, fromUserId],
  );
  return rowCount > 0;
}

// ── Petals (currency) ──────────────────────────────────────────────────────
async function getBalance(userId) {
  const { rows } = await pool.query(
    `SELECT balance FROM currency WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.balance ?? 0;
}

// Add petals to a user's balance (creates row if missing). Returns new balance.
async function addBalance(userId, amount) {
  const { rows } = await pool.query(
    `INSERT INTO currency (user_id, balance) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET balance = currency.balance + $2
     RETURNING balance`,
    [userId, amount],
  );
  return rows[0].balance;
}

// Deduct petals atomically. Returns false if insufficient balance.
async function deductBalance(userId, amount) {
  const { rows } = await pool.query(
    `UPDATE currency SET balance = balance - $2
     WHERE user_id = $1 AND balance >= $2
     RETURNING balance`,
    [userId, amount],
  );
  return rows.length > 0;
}

// Transfer petals from one user to another atomically. Returns false on failure.
async function transferBalance(fromUserId, toUserId, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE currency SET balance = balance - $2
       WHERE user_id = $1 AND balance >= $2
       RETURNING balance`,
      [fromUserId, amount],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `INSERT INTO currency (user_id, balance) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET balance = currency.balance + $2`,
      [toUserId, amount],
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Daily claim ────────────────────────────────────────────────────────────
const DAILY_BASE = 100;
const DAILY_STREAK_BONUS = 10;
const STREAK_RESET_HOURS = 48; // miss 2 days → streak resets

async function getDailyInfo(userId) {
  const { rows } = await pool.query(
    `SELECT balance, streak, last_daily FROM currency WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? { balance: 0, streak: 0, last_daily: null };
}

// Returns { petals, newStreak, alreadyClaimed, hoursLeft }
async function claimDaily(userId) {
  const info = await getDailyInfo(userId);
  const now = Date.now();

  if (info.last_daily) {
    const lastMs = new Date(info.last_daily).getTime();
    const hoursSince = (now - lastMs) / 3_600_000;

    if (hoursSince < 24) {
      const hoursLeft = Math.ceil(24 - hoursSince);
      return { alreadyClaimed: true, hoursLeft };
    }

    // Missed more than 48h → streak resets to 1
    var newStreak = hoursSince > STREAK_RESET_HOURS ? 1 : info.streak + 1;
  } else {
    var newStreak = 1;
  }

  const petals = DAILY_BASE + (newStreak - 1) * DAILY_STREAK_BONUS;

  await pool.query(
    `INSERT INTO currency (user_id, balance, streak, last_daily)
       VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET balance    = currency.balance + $2,
           streak     = $3,
           last_daily = now()`,
    [userId, petals, newStreak],
  );

  return { alreadyClaimed: false, petals, newStreak };
}

// ── Shop ───────────────────────────────────────────────────────────────────
/** Returns true if the user has already purchased this shop item. */
async function hasShopItem(userId, shopItemId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM shop_purchases WHERE user_id = $1 AND shop_item_id = $2`,
    [userId, shopItemId],
  );
  return rows.length > 0;
}

/** Record a shop purchase (call AFTER deducting balance). */
async function recordShopPurchase(userId, shopItemId) {
  await pool.query(
    `INSERT INTO shop_purchases (user_id, shop_item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, shopItemId],
  );
}

// ── Duel log ───────────────────────────────────────────────────────────────
async function logDuel(winnerId, loserId, winnerChar, loserChar, turns, payout) {
  await pool.query(
    `INSERT INTO duel_log (winner_id, loser_id, winner_char, loser_char, turns_taken, payout)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [winnerId, loserId, winnerChar, loserChar, turns, payout],
  );
}

module.exports = {
  pool,
  init,
  MAX_HAREM_SIZE,
  // pulls
  pullsInLastHour,
  logPull,
  minutesUntilNextSlot,
  // pity
  getPity,
  bumpPity,
  // harem
  countHarem,
  addToHarem,
  getHarem,
  removeFromHarem,
  transferHaremEntry,
  // currency
  getBalance,
  addBalance,
  deductBalance,
  transferBalance,
  getDailyInfo,
  claimDaily,
  DAILY_BASE,
  DAILY_STREAK_BONUS,
  // duel
  logDuel,
  // shop
  hasShopItem,
  recordShopPurchase,
};
