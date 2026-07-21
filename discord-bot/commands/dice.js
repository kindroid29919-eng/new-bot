/**
 * dice.js — x!dice [sides | NdM]         → fun roll (no bet)
 *           x!dice bet <amount>           → bet up to 600 Petals; roll d6, 4–6 wins
 *
 * Examples:
 *   x!dice         → rolls 1d6
 *   x!dice 20      → rolls 1d20
 *   x!dice 2d6     → rolls 2d6
 *   x!dice bet 30  → bets 30 Petals on rolling 4, 5, or 6
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const MAX_BET = 600;

async function execute(message, args) {
  // ── Betting mode ──────────────────────────────────────────────────────────
  if (args[0]?.toLowerCase() === 'bet') {
    const bet = parseInt(args[1], 10);
    if (!bet || bet < 1 || isNaN(bet)) {
      return message.reply(`❌ Usage: \`x!dice bet <amount>\` (1–${MAX_BET} Petals)\nRoll a d6 — 4, 5, or 6 wins!`);
    }
    if (bet > MAX_BET) {
      return message.reply(`🚫 Maximum bet is **${MAX_BET} 🌸 Petals** per roll.`);
    }

    const balance = await db.getBalance(message.author.id);
    if (balance < bet) {
      return message.reply(`💸 You only have **${balance} 🌸 Petals**. Use \`x!daily\` to earn more!`);
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const won = roll >= 4;

    if (won) {
      await db.addBalance(message.author.id, bet);
    } else {
      await db.deductBalance(message.author.id, bet);
    }

    const newBal = await db.getBalance(message.author.id);
    const changeStr = won ? `**+${bet}** 🌸 Petals` : `**-${bet}** 🌸 Petals`;

    const embed = new EmbedBuilder()
      .setColor(won ? 0x2ed573 : 0xff4757)
      .setTitle(`🎲 Dice Bet — ${won ? 'Win! 🎉' : 'Loss 💀'}`)
      .setDescription(
        `${faces[roll]} You rolled a **${roll}** — ${roll >= 4 ? '✅ High (4–6)!' : '❌ Low (1–3)'}\n\n` +
        `${changeStr}\n💰 Balance: **${newBal.toLocaleString()} Petals**`,
      )
      .setFooter({ text: `Roll 4–6 to win! Max bet: ${MAX_BET} Petals` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ── Fun roll mode ─────────────────────────────────────────────────────────
  let count = 1;
  let sides = 6;

  if (args[0]) {
    const ndm = args[0].toLowerCase().match(/^(\d+)d(\d+)$/);
    if (ndm) {
      count = Math.min(20, parseInt(ndm[1], 10));
      sides = Math.min(1000, parseInt(ndm[2], 10));
    } else if (!isNaN(args[0])) {
      sides = Math.min(1000, Math.max(2, parseInt(args[0], 10)));
    }
  }

  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((a, b) => a + b, 0);

  const embed = new EmbedBuilder()
    .setColor(0xff6b81)
    .setTitle('🎲 Dice Roll')
    .addFields(
      { name: 'Rolls', value: rolls.join(', '), inline: true },
      { name: 'Total', value: `**${total}**`, inline: true },
    )
    .setFooter({ text: `${count}d${sides} • Tip: x!dice bet 20 to wager up to ${MAX_BET} Petals!` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'dice',
  aliases: ['roll'],
  description: `Roll dice (supports NdM). Bet up to ${MAX_BET} Petals: x!dice bet 20 — roll 4–6 to win!`,
  usage: 'dice [sides | NdM | bet <amount>]',
  category: 'Economy',
};
