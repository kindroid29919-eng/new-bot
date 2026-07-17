/**
 * choose.js — x!choose <option1> | <option2> | ...
 * Picks a random option from a pipe-separated list.
 * Usage: x!choose pizza | tacos | sushi
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  const input   = args.join(' ');
  const options = input.split('|').map(o => o.trim()).filter(Boolean);

  if (options.length < 2) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!choose <option1> | <option2> | ...`\nProvide at least 2 options separated by `|`.').setTimestamp()],
    });
  }

  const choice = options[Math.floor(Math.random() * options.length)];

  const embed = new EmbedBuilder()
    .setColor(0x2ed573)
    .setTitle('🤔  I Choose...')
    .addFields(
      { name: 'Options', value: options.map(o => `• ${o}`).join('\n'), inline: false },
      { name: 'Result',  value: `**${choice}**`,                        inline: false },
    )
    .setFooter({ text: `Chosen for ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'choose',
  aliases: ['pick'],
  description: 'Randomly picks between options',
  usage: 'choose <option1> | <option2> | ...',
  category: 'Mini Games',
};
