/**
 * weekly.js — x!weekly
 * Claim your weekly Petals. Larger base reward than daily, with a streak bonus.
 * Base: 500 Petals on week 1, +50 per streak week after that.
 * Miss 2 weeks → streak resets to 1.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

async function execute(message) {
  const result = await db.claimWeekly(message.author.id);

  if (result.alreadyClaimed) {
    const h = result.hoursLeft;
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('🌸 Already Claimed')
          .setDescription(
            `You already collected your weekly Petals!\n\n` +
            `⏳ Come back in **${h} hour${h !== 1 ? 's' : ''}**.`,
          )
          .setTimestamp(),
      ],
    });
  }

  const nextAmount = db.WEEKLY_BASE + result.newStreak * db.WEEKLY_STREAK_BONUS;
  const balance    = await db.getBalance(message.author.id);

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle('🌸 Weekly Petals Collected!')
    .setDescription(
      `You received **${result.petals} 🌸 Petals**!\n\n` +
      `🔥 **Streak:** Week ${result.newStreak}\n` +
      `💰 **Balance:** ${balance.toLocaleString()} Petals\n\n` +
      (result.newStreak < 2
        ? `Claim again next week to start a streak! Each week adds **+50 Petals** bonus.`
        : `Next week you'll earn **${nextAmount} Petals** (Week ${result.newStreak + 1})!`),
    )
    .setFooter({ text: `${message.author.tag} • Come back in 7 days` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'weekly',
  aliases: ['weeklyclaim'],
  description: 'Collect your weekly Petals. Streak gives a bigger bonus each consecutive week.',
  usage: 'weekly',
  category: 'Economy',
};
