/**
 * wanted.js — x!wanted
 * Creates a fake "Wanted Poster" for a user.
 * Usage: x!wanted <name | @user>
 */

const { EmbedBuilder } = require('discord.js');
const { randomFrom }   = require('../utils/embedBuilder');
const { avoidRepeat }  = require('../utils/recentCache');

const { crimes, bounties, aliases, locations } = require('../data/wanted.json');

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Usage')
          .setDescription('`x!wanted <name | @user>`')
          .setTimestamp(),
      ],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? `@${mention.displayName}` : args.join(' ');

  const result = avoidRepeat('wanted', () => {
    const crime    = randomFrom(crimes);
    const bounty   = randomFrom(bounties);
    const alias    = randomFrom(aliases);
    const location = randomFrom(locations);
    return JSON.stringify({ crime, bounty, alias, location });
  });

  const { crime, bounty, alias, location } = JSON.parse(result);

  const embed = new EmbedBuilder()
    .setColor(0xff4757)
    .setTitle('🚨  W A N T E D  🚨')
    .setDescription(`*This poster is issued by the Bureau of Completely Fictional Crimes.*`)
    .addFields(
      { name: '🧑 Name',          value: target,   inline: true },
      { name: '🎭 Alias',         value: alias,    inline: true },
      { name: '\u200B',           value: '\u200B', inline: false },
      { name: '🔍 Wanted For',    value: crime,    inline: false },
      { name: '💰 Reward',        value: bounty,   inline: true },
      { name: '📍 Last Seen',     value: location, inline: true },
    )
    .setFooter({ text: `Reported by ${message.author.tag}  •  All crimes are fictional` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Generate a fictional Wanted Poster for a user',
  usage: 'wanted <name | @user>',
  category: 'Fun',
};
