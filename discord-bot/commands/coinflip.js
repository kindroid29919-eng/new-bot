/**
 * coinflip.js — x!coinflip [heads|tails] [amount]
 *
 * Without a bet:  x!coinflip          → just flips for fun
 * With a bet:     x!coinflip heads 25 → bet 25 Petals on heads (max 600)
 *
 * Win → earn the bet amount. Lose → lose the bet amount.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const MAX_BET = 600;

async function execute(message, args) {
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const emoji  = result === 'heads' ? '🪙' : '🌑';

  // ── No-bet mode ──────────────────────────────────────────────────────────
  if (!args.length || (args.length === 1 && !['heads', 'tails', 'h', 't'].includes(args[0].toLowerCase()))) {
    const embed = new EmbedBuilder()
      .setColor(0xf9ca24)
      .setTitle('🪙  Coin Flip')
      .setDescription(`The coin landed on... **${result.charAt(0).toUpperCase() + result.slice(1)}** ${emoji}`)
      .setFooter({ text: `Tip: x!coinflip heads 20 — bet up to ${MAX_BET} Petals!` })
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // ── Bet mode ─────────────────────────────────────────────────────────────
  const rawSide = args[0].toLowerCase();
  const side = rawSide === 'h' ? 'heads' : rawSide === 't' ? 'tails' : rawSide;

  if (side !== 'heads' && side !== 'tails') {
    return message.reply('❌ Choose **heads** or **tails**. Example: `x!coinflip heads 15`');
  }

  const bet = parseInt(args[1], 10);
  if (!bet || bet < 1 || isNaN(bet)) {
    return message.reply(`❌ Enter a valid bet amount (1–${MAX_BET}). Example: \`x!coinflip heads 15\``);
  }
  if (bet > MAX_BET) {
    return message.reply(`🚫 Maximum bet is **${MAX_BET} 🌸 Petals** per flip.`);
  }

  const balance = await db.getBalance(message.author.id);
  if (balance < bet) {
    return message.reply(
      `💸 You only have **${balance} 🌸 Petals** — not enough to bet **${bet}**.\n` +
      `Use \`x!daily\` to earn more!`,
    );
  }

  const won = side === result;

  if (won) {
    await db.addBalance(message.author.id, bet);
  } else {
    await db.deductBalance(message.author.id, bet);
  }

  const newBalance = await db.getBalance(message.author.id);

  const embed = new EmbedBuilder()
    .setColor(won ? 0x2ed573 : 0xff4757)
    .setTitle(`🪙 Coin Flip — ${won ? 'You Won! 🎉' : 'You Lost 💀'}`)
    .setDescription(
      `The coin landed on... **${result.charAt(0).toUpperCase() + result.slice(1)}** ${emoji}\n\n` +
      `You called **${side}** — ${won ? '✅ correct!' : '❌ wrong!'}\n` +
      `${won ? `**+${bet}** 🌸 Petals` : `**-${bet}** 🌸 Petals`}\n\n` +
      `💰 Balance: **${newBalance.toLocaleString()} Petals**`,
    )
    .setFooter({ text: `Flipped by ${message.author.tag} • Max bet: ${MAX_BET} Petals` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'coinflip',
  aliases: ['cf', 'flip'],
  description: `Flip a coin. Optionally bet up to ${MAX_BET} Petals: x!coinflip heads 20`,
  usage: 'coinflip [heads|tails] [amount]',
  category: 'Economy',
};
