/**
 * pp.js — x!pp <user>
 * Meme "PP size" command.
 * Usage: x!pp <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!pp <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const size    = Math.floor(Math.random() * 16); // 0-15
  const bar     = '8' + '='.repeat(size) + 'D';

  const embed = new EmbedBuilder()
    .setColor(0x70a1ff)
    .setTitle('📏  PP Size Measurement')
    .addFields(
      { name: 'Target', value: target,           inline: true },
      { name: 'Size',   value: `${size} cm`,     inline: true },
      { name: 'Result', value: `\`${bar}\``,     inline: false },
    )
    .setFooter({ text: `Measured by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'pp',
  aliases: [],
  description: 'Meme PP size command',
  usage: 'pp <name | @user>',
  category: 'Mini Games',
};
