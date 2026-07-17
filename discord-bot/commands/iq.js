/**
 * iq.js — x!iq <user>
 * Generates a random (fake) IQ score for someone.
 * Usage: x!iq <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const TIERS = [
  { min: 180, max: 300, label: 'Certified Genius',  emoji: '🧠', color: 0x2ed573 },
  { min: 140, max: 179, label: 'Big Brain',          emoji: '🤓', color: 0x7bed9f },
  { min: 110, max: 139, label: 'Above Average',      emoji: '🙂', color: 0x70a1ff },
  { min: 90,  max: 109, label: 'Average',            emoji: '😐', color: 0xf9ca24 },
  { min: 60,  max: 89,  label: 'Questionable',       emoji: '😵', color: 0xffa502 },
  { min: 0,   max: 59,  label: 'Goldfish Tier',      emoji: '🐟', color: 0xff4757 },
];

function getTier(score) {
  return TIERS.find(t => score >= t.min && score <= t.max) || TIERS[TIERS.length - 1];
}

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!iq <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const score   = Math.floor(Math.random() * 221); // 0-220
  const tier    = getTier(score);

  const embed = new EmbedBuilder()
    .setColor(tier.color)
    .setTitle('🧠  IQ Test')
    .addFields(
      { name: 'Target', value: target,                          inline: true },
      { name: 'IQ',     value: `**${score}**`,                  inline: true },
      { name: 'Rank',   value: `${tier.emoji}  **${tier.label}**`, inline: true },
    )
    .setFooter({ text: `Tested by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'iq',
  aliases: [],
  description: 'Generates a random IQ score for someone',
  usage: 'iq <name | @user>',
  category: 'Personality',
};
