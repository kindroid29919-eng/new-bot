/**
 * dice.js — x!dice [sides]
 * Rolls a die (default 6-sided, or NdM notation like 2d6).
 * Usage: x!dice
 * Usage: x!dice 20
 * Usage: x!dice 2d6
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
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
    .setTitle('🎲  Dice Roll')
    .addFields(
      { name: 'Rolls', value: rolls.join(', '), inline: true },
      { name: 'Total', value: `**${total}**`,   inline: true },
    )
    .setFooter({ text: `Rolled by ${message.author.tag} • ${count}d${sides}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'dice',
  aliases: ['roll'],
  description: 'Rolls a die (supports NdM notation)',
  usage: 'dice [sides | NdM]',
  category: 'Mini Games',
};
