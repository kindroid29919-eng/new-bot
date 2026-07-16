/**
 * config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central configuration file.
 * All values come from environment variables (loaded via dotenv in index.js).
 * ─────────────────────────────────────────────────────────────────────────────
 */

module.exports = {
  // The prefix that triggers bot commands (e.g. "x!")
  prefix: process.env.PREFIX || 'x!',

  // Bot token — loaded from the .env file, never hardcoded
  token: process.env.DISCORD_TOKEN,

  // Embed colors used randomly for each expose response
  embedColors: [
    0xff4757, // red
    0xff6b81, // pink-red
    0xffa502, // orange
    0xeccc68, // yellow
    0x2ed573, // green
    0x1e90ff, // blue
    0x5352ed, // indigo
    0xa29bfe, // purple
    0xfd79a8, // hot pink
    0x00cec9, // teal
    0xe17055, // salmon
    0x6c5ce7, // violet
    0x00b894, // mint
    0xff7675, // coral
    0x74b9ff, // sky blue
  ],

  // Footer messages rotated randomly on each command use
  footerMessages: [
    '👀 The truth always comes out.',
    '☕ Sip the tea.',
    '🕵️ Nothing is safe from x!expose.',
    '📢 Consider yourself exposed.',
    '🎯 Dead accurate.',
    '🔥 They really said that.',
    '💀 No survivors.',
    '🧢 No cap.',
    '😭 We're praying for you.',
    '🗿 Respect. Or not.',
    '🎭 Dramatic, but fair.',
    '🫡 Our condolences.',
    '✅ The people have spoken.',
    '💅 Periodt.',
    '🧠 Big brain energy… not.',
    '📜 This has been filed into the records.',
    '🏆 Congrats on this achievement.',
    '🌚 Late night thoughts hit different.',
    '🃏 The cards don't lie.',
    '⚖️ The verdict is in.',
  ],
};
