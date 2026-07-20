/**
 * slots.js — x!slots [amount]
 * Spin the slot machine. Bet up to 60 🌸 Petals.
 * Without a bet: spins for fun.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const MAX_BET = 60;

// Symbol pool: [symbol, weight, displayName]
const SYMBOLS = [
  { s: '🍒', w: 35, name: 'Cherry' },
  { s: '🍋', w: 28, name: 'Lemon' },
  { s: '🍊', w: 20, name: 'Orange' },
  { s: '⭐', w: 10, name: 'Star' },
  { s: '💎', w: 5,  name: 'Diamond' },
  { s: '🌸', w: 2,  name: 'Petal' },
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
  if (a === b && b === c) {
    const mult = THREE_OF_A_KIND[a] ?? 1;
    return { label: `🎰 JACKPOT — ${a}${b}${c}!`, mult, net: Math.round(bet * mult) };
  }
  if (a === b || b === c || a === c) {
    return { label: `✨ Two of a kind!`, mult: 0.5, net: Math.round(bet * 0.5) };
  }
  return { label: `💔 No match`, mult: 0, net: -bet };
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
  if (bet < 1 || isNaN(bet)) return message.reply('❌ Enter a valid bet (1–60).');
  if (bet > MAX_BET) return message.reply(`🚫 Maximum bet is **${MAX_BET} 🌸 Petals** per spin.`);

  const balance = await db.getBalance(message.author.id);
  if (balance < bet) {
    return message.reply(`💸 You only have **${balance} 🌸 Petals**. Use \`x!daily\` to earn more!`);
  }

  const { label, net } = calcResult(reels, bet);
  const won = net > 0;

  if (won) {
    await db.addBalance(message.author.id, net);
  } else if (net < 0) {
    await db.deductBalance(message.author.id, bet);
  } else {
    // Exact tie (returned half) — add net (which is positive half)
    await db.addBalance(message.author.id, net);
    await db.deductBalance(message.author.id, bet);
  }

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
      { name: '🌸 Jackpot table', value:
        '🌸🌸🌸 = ×20 | 💎💎💎 = ×10\n⭐⭐⭐ = ×5  | 🍊🍊🍊 = ×3\n🍋🍋🍋 = ×2  | 🍒🍒🍒 = ×1.5\nTwo of a kind = ×0.5 (half back)',
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
