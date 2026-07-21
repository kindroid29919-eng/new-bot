/**
 * slots.js — x!slots [amount]
 * Spin the slot machine. Bet up to 600 🌸 Petals.
 * Without a bet: spins for fun.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const MAX_BET = 10000;

// Symbol pool: [symbol, weight, displayName]
// Lemon weight is boosted so P(🍋🍋🍋 × 2) ≈ P(no match × 0)
const SYMBOLS = [
  { s: '🍒', w: 35,  name: 'Cherry' },
  { s: '🍋', w: 105, name: 'Lemon' },
  { s: '🍊', w: 20,  name: 'Orange' },
  { s: '⭐', w: 10,  name: 'Star' },
  { s: '💎', w: 5,   name: 'Diamond' },
  { s: '🌸', w: 2,   name: 'Petal' },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((a, s) => a + s.w, 0);

function spin() {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const sym of SYMBOLS) {
    rand -= sym.w;
    if (rand <= 0) return sym;
  }
  return SYMBOLS[0];
}

/**
 * Payout multiplier on bet (e.g. 20 = win 20× your bet).
 * "No match" and "2 same" apply when all 3 reels are checked.
 */
const THREE_OF_A_KIND = {
  '🌸': 20, '💎': 10, '⭐': 5, '🍊': 3, '🍋': 2, '🍒': 1.5,
};

function calcResult(reels, bet) {
  const [a, b, c] = reels.map(r => r.s);

  // Three of a kind — untouched: payout scales with symbol rarity, so it's
  // already "gradually lower but realistic" (rarer symbol = bigger jackpot,
  // and naturally rarer to land since it depends on the reel weights).
  if (a === b && b === c) {
    const mult = THREE_OF_A_KIND[a] ?? 1;
    return { label: `🎰 JACKPOT — ${a}${b}${c}!`, mult, net: Math.round(bet * mult) };
  }

  // Two of a kind — previously always paid a flat 0.5x, which combined with
  // how common a 2-match is made the game feel like a guaranteed small win.
  // Now it's a 50/50 split between a small loss (0.5x back) and a small win
  // (1.5x back), so landing a pair is a genuine coin flip rather than a
  // near-guaranteed partial refund.
  if (a === b || b === c || a === c) {
    const mult = Math.random() < 0.5 ? 0.5 : 1.5;
    const label = mult < 1 ? `✨ Two of a kind — small loss` : `✨ Two of a kind — small win!`;
    return { label, mult, net: Math.round(bet * mult) };
  }

  // No match — total loss, no exceptions.
  return { label: `💔 No match`, mult: 0, net: 0 };
}

async function execute(message, args) {
  const reels = [spin(), spin(), spin()];
  const reelStr = reels.map(r => r.s).join(' | ');

  // No bet — pure fun spin
  if (!args.length || isNaN(parseInt(args[0], 10))) {
    const embed = new EmbedBuilder()
      .setColor(0xf9ca24)
      .setTitle('🎰 Slot Machine')
      .setDescription(`[ ${reelStr} ]\n\n${calcResult(reels, 0).label}`)
      .setFooter({ text: `Tip: x!slots 30 — bet up to ${MAX_BET} Petals!` })
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Bet mode
  const bet = parseInt(args[0], 10);
  if (bet < 1 || isNaN(bet)) return message.reply(`❌ Enter a valid bet (1–${MAX_BET}).`);
  if (bet > MAX_BET) return message.reply(`🚫 Maximum bet is **${MAX_BET} 🌸 Petals** per spin.`);

  const balance = await db.getBalance(message.author.id);
  if (balance < bet) {
    return message.reply(`💸 You only have **${balance} 🌸 Petals**. Use \`x!daily\` to earn more!`);
  }

  const { label, mult, net: payout } = calcResult(reels, bet);

  // Always take the bet first, then pay out mult × bet if there's anything
  // to pay. Previously only `addBalance(net)` ran on a win, so the bet
  // itself was never actually removed from the balance — e.g. a two-of-a-
  // kind result silently kept the player's full original bet AND added the
  // 0.5x win on top, instead of net costing them -0.5x.
  await db.deductBalance(message.author.id, bet);
  if (payout > 0) {
    await db.addBalance(message.author.id, payout);
  }

  const net = payout - bet; // for display only
  const newBalance = await db.getBalance(message.author.id);

  const color = net > 0 ? 0x2ed573 : net === 0 ? 0xffa502 : 0xff4757;
  const changeStr = net > 0 ? `**+${net}** 🌸 Petals` : net < 0 ? `**${net}** 🌸 Petals` : `±0 Petals`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('🎰 Slot Machine')
    .setDescription(
      `[ ${reelStr} ]\n\n` +
      `${label}\n` +
      `${changeStr}\n\n` +
      `💰 Balance: **${newBalance.toLocaleString()} Petals**`,
    )
    .addFields(
      { name: '🌸 Payout table', value:
        '🌸🌸🌸 = ×20 | 💎💎💎 = ×10\n⭐⭐⭐ = ×5  | 🍊🍊🍊 = ×3\n🍋🍋🍋 = ×2  | 🍒🍒🍒 = ×1.5\n' +
        'Two of a kind = small win or loss\n' +
        'No match = ×0',
        inline: false,
      },
    )
    .setFooter({ text: `Spun by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'slots',
  aliases: ['slot', 'spin'],
  description: `Spin the slot machine — bet up to ${MAX_BET} Petals. 🌸🌸🌸 = ×20 jackpot!`,
  usage: 'slots [amount]',
  category: 'Economy',
};
