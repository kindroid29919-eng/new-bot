/**
 * enemy.js — x!enemy <user>
 * Calculates rivalry percentage and level.
 * Usage: x!enemy <user>
 */

const { EmbedBuilder } = require('discord.js');
const { levels, emojis, comments } = require('../data/enemys.js');

// Cache to prevent immediate repetition of the last 15 rivalry comments
const recentComments = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Usage Error')
          .setDescription('Correct usage: `x!enemy <user>`')
          .setTimestamp()
      ],
    });
  }

  // Resolve target name via mention or plain text input
  const targetUser = message.mentions.users.first();
  const targetName = targetUser ? targetUser.username : args.join(' ');

  // Generate rivalry percentage
  const percentage = Math.floor(Math.random() * 101);

  // Pick a random level and emoji
  const level = levels[Math.floor(Math.random() * levels.length)];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  // Pick a unique comment avoiding the recent list
  let commentIndex;
  let attempts = 0;
  do {
    commentIndex = Math.floor(Math.random() * comments.length);
    attempts++;
  } while (recentComments.includes(commentIndex) && attempts < 20);

  // Update comment cache track
  recentComments.push(commentIndex);
  if (recentComments.length > 15) {
    recentComments.shift();
  }

  const comment = comments[commentIndex];

  // Build clean red embed matching existing commands
  const embed = new EmbedBuilder()
    .setColor(0xff4757)
    .setTitle(`${emoji}  Rivalry Radar`)
    .setDescription(`Measuring the tension between **${message.author.username}** and **${targetName}**...`)
    .addFields(
      { name: 'Rivalry %', value: `**${percentage}%**`, inline: true },
      { name: 'Rivalry Level', value: `*${level}*`, inline: true },
      { name: 'Report', value: comment, inline: false }
    )
    .setFooter({ text: `Target scanned by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'enemy',
  aliases: ['rival'],
  description: 'Check your rivalry rating with a foe!',
  usage: 'enemy <user>',
  category: 'Social',
};
