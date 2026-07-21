/**
 * crime.js — x!crime
 * Generates a completely fictional, humorous crime for a user.
 * Usage: x!crime <name | @user>
 */

const { EmbedBuilder } = require('discord.js');
const { randomFrom }   = require('../utils/embedBuilder');
const { avoidRepeat }  = require('../utils/recentCache');

const { crimes, severities, punishments } = require('../data/crimes.json');

// Severity → embed colour
const SEVERITY_COLORS = {
  'Petty Crime':             0x2ed573,
  'Minor Offense':           0xa8e6cf,
  'Misdemeanor':             0xfdcb6e,
  'Serious Offense':         0xffa502,
  'Felony':                  0xff7f50,
  'Federal Crime':           0xff6348,
  'International Incident':  0xff4757,
  'National Threat':         0xe84393,
  'Global Menace':           0x9b59b6,
  'Universal Menace':        0x6c5ce7,
  'Cosmic Criminal':         0x2c2c54,
};

function pickColor(severity) {
  return SEVERITY_COLORS[severity] ?? 0xff4757;
}

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Usage')
          .setDescription('`x!crime <name | @user>`')
          .setTimestamp(),
      ],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? `@${mention.displayName}` : args.join(' ');

  const result = avoidRepeat('crime', () => {
    const crime    = randomFrom(crimes);
    const severity = randomFrom(severities);
    const sentence = randomFrom(punishments);
    return JSON.stringify({ crime, severity, sentence });
  });

  const { crime, severity, sentence } = JSON.parse(result);

  const embed = new EmbedBuilder()
    .setColor(pickColor(severity))
    .setTitle('🚔  Crime Report')
    .addFields(
      { name: '🧑‍💼 Suspect',   value: target,   inline: true },
      { name: '⚖️ Severity',   value: severity, inline: true },
      { name: '🔍 Crime',      value: crime,    inline: false },
      { name: '🔨 Sentence',   value: sentence, inline: false },
    )
    .setFooter({ text: `Filed by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Generate a fictional, humorous crime for a user',
  usage: 'crime <name | @user>',
  category: 'Fun',
};
