/**
 * daily.js — x!daily
 * Claim your daily Petals. Streak grows +1 each consecutive day.
 * Base: 100 Petals on day 1, +10 per streak day after that.
 * Miss 2 days → streak resets to 1.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

async function execute(message) {
  const result = await db.claimDaily(message.author.id);

  if (result.alreadyClaimed) {
    const h = result.hoursLeft;
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('🌸 Already Claimed')
          .setDescription(
            `You already collected your daily Petals!\n\n` +
            `⏳ Come back in **${h} hour${h !== 1 ? 's' : ''}**.`,
          )
          .setTimestamp(),
      ],
    });
  }

  const nextAmount = db.DAILY_BASE + result.newStreak * db.DAILY_STREAK_BONUS;
  const balance    = await db.getBalance(message.author.id);

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle('🌸 Daily Petals Collected!')
    .setDescription(
      `You received **${result.petals} 🌸 Petals**!\n\n` +
      `🔥 **Streak:** Day ${result.newStreak}\n` +
      `💰 **Balance:** ${balance.toLocaleString()} Petals\n\n` +
      (result.newStreak < 2
        ? `Claim again tomorrow to start a streak! Each day adds **+10 Petals** bonus.`
        : `Tomorrow you'll earn **${nextAmount} Petals** (Day ${result.newStreak + 1})!`),
    )
    .setFooter({ text: `${message.author.tag} • Come back in 24h` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'daily',
  aliases: ['claim'],
  description: 'Collect your daily Petals. Streak gives bonus Petals each consecutive day.',
  usage: 'daily',
  category: 'Economy',
};
