/**
 * title.js — x!title
 * Assigns a ridiculous title by combining a prefix and an ending.
 * With 100+ prefixes × 200+ endings = 20,000+ unique combinations.
 * Usage: x!title <name | @user>
 */

const { EmbedBuilder } = require('discord.js');
const { randomFrom }   = require('../utils/embedBuilder');
const { avoidRepeat }  = require('../utils/recentCache');

const { prefixes, endings } = require('../data/titles.json');

// A small palette of regal colours to cycle through
const COLORS = [
  0xffd32a, 0xf9ca24, 0xfdcb6e, 0xe17055,
  0x6c5ce7, 0x00cec9, 0x55efc4, 0xff6b9d,
  0xa29bfe, 0x74b9ff, 0x2ed573, 0xff4757,
];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Usage')
          .setDescription('`x!title <name | @user>`')
          .setTimestamp(),
      ],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');

  const result = avoidRepeat('title', () => {
    const prefix = randomFrom(prefixes);
    const ending = randomFrom(endings);
    return `${prefix} ${ending}`;
  });

  const color = randomFrom(COLORS);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('👑  Official Title')
    .setDescription(
      `**${target}**\n\n` +
      `*Your official title is:*\n\n` +
      `## ${result}`,
    )
    .setFooter({ text: `Bestowed by ${message.author.tag}  •  This title is legally binding (it is not)` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Assign a ridiculous official title to a user (20,000+ combinations)',
  usage: 'title <name | @user>',
  category: 'Fun',
};
