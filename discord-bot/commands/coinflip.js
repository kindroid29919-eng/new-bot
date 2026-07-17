/**
 * coinflip.js — x!coinflip
 * Flips a coin.
 * Usage: x!coinflip
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
  const emoji  = result === 'Heads' ? '🪙' : '🌑';

  const embed = new EmbedBuilder()
    .setColor(0xf9ca24)
    .setTitle('🪙  Coin Flip')
    .setDescription(`The coin landed on... **${result}** ${emoji}`)
    .setFooter({ text: `Flipped by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'coinflip',
  aliases: ['cf'],
  description: 'Flips a coin',
  usage: 'coinflip',
  category: 'Mini Games',
};
