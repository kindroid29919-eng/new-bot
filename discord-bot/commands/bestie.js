/**
 * bestie.js — x!bestie <user>
 * Calculates friendship percentage and status.
 * Usage: x!bestie <user>
 */

const { EmbedBuilder } = require('discord.js');
const { statuses, emojis, comments } = require('../data/besties.js');

// Cache to prevent immediate repetition of the last 15 comments
const recentComments = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Usage Error')
          .setDescription('Correct usage: `x!bestie <user>`')
          .setTimestamp()
      ],
    });
  }

  // Resolve target name via mention or plain text input
  const targetUser = message.mentions.users.first();
  const targetName = targetUser ? targetUser.username : args.join(' ');

  // Generate friendship percentage
  const percentage = Math.floor(Math.random() * 101);

  // Pick a random status and emoji
  const status = statuses[Math.floor(Math.random() * statuses.length)];
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

  // Build clean teal/blue embed matching existing commands
  const embed = new EmbedBuilder()
    .setColor(0x00d2d3)
    .setTitle(`${emoji}  Friendship Meter`)
    .setDescription(`Checking the bond between **${message.author.username}** and **${targetName}**...`)
    .addFields(
      { name: 'Friendship %', value: `**${percentage}%**`, inline: true },
      { name: 'Status', value: `*${status}*`, inline: true },
      { name: 'Analysis', value: comment, inline: false }
    )
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'bestie',
  aliases: ['friends'],
  description: 'Check your friendship rating with someone!',
  usage: 'bestie <user>',
  category: 'Social',
};
