/**
 * rizz.js — x!rizz
 * Calculates someone's rizz score (0–100).
 * Usage: x!rizz <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const TIERS = [
  { min: 100, max: 100, label: 'Unspoken Rizz',    emoji: '👑', color: 0xffd32a },
  { min: 86,  max: 99,  label: 'High Rizz',        emoji: '💅', color: 0xff6b9d },
  { min: 71,  max: 85,  label: 'Rizz Detected',    emoji: '🔥', color: 0xff4757 },
  { min: 56,  max: 70,  label: 'Some Rizz',        emoji: '😏', color: 0xffa502 },
  { min: 41,  max: 55,  label: 'Mid Rizz',         emoji: '😐', color: 0xfdcb6e },
  { min: 26,  max: 40,  label: 'Rizzless',         emoji: '🫠', color: 0x74b9ff },
  { min: 11,  max: 25,  label: 'Negative Rizz',    emoji: '😬', color: 0xa29bfe },
  { min: 0,   max: 10,  label: 'No Rizz',          emoji: '💀', color: 0xff4757 },
];

const RIZZ_LINES = [
  'The charisma scanner has returned results.',
  'Attraction algorithm complete.',
  'Vibe check concluded.',
  'The flirt-o-meter has spoken.',
  'Social skills have been assessed.',
  'The confidence calibration is done.',
  'Rizz levels have been measured.',
  'The energy scan is in.',
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
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!rizz <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const pct     = Math.floor(Math.random() * 101);
  const tier    = getTier(pct);
  const line    = RIZZ_LINES[Math.floor(Math.random() * RIZZ_LINES.length)];

  const embed = new EmbedBuilder()
    .setColor(tier.color)
    .setTitle('😏  Rizz Score')
    .setDescription(`*"${line}"*`)
    .addFields(
      { name: 'Target',    value: target,                              inline: true },
      { name: 'Rizz',      value: `**${pct}/100**`,                   inline: true },
      { name: 'Level',     value: `${tier.emoji}  **${tier.label}**`, inline: true },
      { name: 'Rizz Bar',  value: `\`${bar(pct)}\`  ${pct}%`,       inline: false },
    )
    .setFooter({ text: `Assessed by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: "Rate someone's rizz score (0–100)",
  usage: 'rizz <name | @user>',
  category: 'Fun',
};
