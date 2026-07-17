/**
 * ego.js — x!ego <user>
 * Calculates someone's ego percentage.
 * Usage: x!ego <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const TIERS = [
  { min: 86,  max: 100, label: 'Godlike Ego',    emoji: '👑', color: 0xff0044 },
  { min: 61,  max: 85,  label: 'Massive Ego',    emoji: '😤', color: 0xff6b81 },
  { min: 36,  max: 60,  label: 'Healthy Ego',    emoji: '😌', color: 0xf9ca24 },
  { min: 11,  max: 35,  label: 'Humble',         emoji: '🙂', color: 0x7bed9f },
  { min: 0,   max: 10,  label: 'No Ego At All',  emoji: '😇', color: 0x2ed573 },
];

function getTier(pct) {
  return TIERS.find(t => pct >= t.min && pct <= t.max) || TIERS[TIERS.length - 1];
}

function bar(pct) {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!ego <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const pct     = Math.floor(Math.random() * 101);
  const tier    = getTier(pct);

  const embed = new EmbedBuilder()
    .setColor(tier.color)
    .setTitle('😎  Ego Meter')
    .addFields(
      { name: 'Target',   value: target,                             inline: true },
      { name: 'Ego %',    value: `**${pct}%**`,                     inline: true },
      { name: 'Level',    value: `${tier.emoji}  **${tier.label}**`, inline: true },
      { name: 'Ego Bar',  value: `\`${bar(pct)}\`  ${pct}%`,        inline: false },
    )
    .setFooter({ text: `Checked by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'ego',
  aliases: [],
  description: "Check someone's ego percentage",
  usage: 'ego <name | @user>',
  category: 'Personality',
};
