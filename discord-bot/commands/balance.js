/**
 * balance.js — x!balance [@user]
 * Check your Petal balance (or another user's).
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

async function execute(message) {
  const target = message.mentions.users.first() || message.author;
  const isSelf = target.id === message.author.id;

  const [balance, info] = await Promise.all([
    db.getBalance(target.id),
    isSelf ? db.getDailyInfo(target.id) : Promise.resolve(null),
  ]);

  let dailyLine = '';
  if (isSelf && info) {
    if (!info.last_daily) {
      dailyLine = '\n\n💡 You haven\'t claimed your daily yet — try `x!daily`!';
    } else {
      const hoursSince = (Date.now() - new Date(info.last_daily).getTime()) / 3_600_000;
      if (hoursSince >= 24) {
        dailyLine = '\n\n💡 Your daily is ready! Use `x!daily` to claim it.';
      } else {
        const hoursLeft = Math.ceil(24 - hoursSince);
        dailyLine = `\n\n⏳ Next daily in **${hoursLeft}h** (streak: Day ${info.streak})`;
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle(`🌸 ${isSelf ? 'Your' : `${target.username}'s`} Petal Balance`)
    .setDescription(`**${balance.toLocaleString()} 🌸 Petals**${dailyLine}`)
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: 'Earn Petals: x!daily • x!coinflip • x!duel • receive from others' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'balance',
  aliases: ['wallet', 'petals', 'bal'],
  description: 'Check your (or someone else\'s) Petal balance.',
  usage: 'balance [@user]',
  category: 'Economy',
};
