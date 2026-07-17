/**
 * aura.js — x!aura
 * Generates someone's aura points (-100 to +1000, with a rare infinite result).
 * Usage: x!aura <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const TIERS = [
  { label: 'Transcendent',   emoji: '🌌', color: 0xdfe6e9, infinite: true },
  { min: 1000, max: 1000,    label: 'Max Aura',         emoji: '👑', color: 0xffd32a },
  { min: 750,  max: 999,     label: 'Godlike Aura',     emoji: '🔱', color: 0xf9ca24 },
  { min: 500,  max: 749,     label: 'Powerful Aura',    emoji: '⚡', color: 0x6c5ce7 },
  { min: 300,  max: 499,     label: 'Strong Aura',      emoji: '🌟', color: 0x00cec9 },
  { min: 100,  max: 299,     label: 'Good Aura',        emoji: '✨', color: 0x55efc4 },
  { min: 0,    max: 99,      label: 'Neutral Aura',     emoji: '😐', color: 0xb2bec3 },
  { min: -49,  max: -1,      label: 'Negative Aura',    emoji: '😬', color: 0xfdcb6e },
  { min: -100, max: -50,     label: 'Aura Vampire',     emoji: '🕳️', color: 0xff4757 },
];

const AURA_LINES = [
  'The vibes were measured.',
  'The spiritual energy scan is complete.',
  'The aura scanner has logged its findings.',
  'Cosmic levels have been detected.',
  'The energy field has been calibrated.',
  'The universe submitted its report.',
  'The aura tribunal has reached a verdict.',
  'Spiritual analytics are in.',
];

function getTier(points, infinite) {
  if (infinite) return TIERS[0];
  return TIERS.find(t => !t.infinite && points >= t.min && points <= t.max) || TIERS[TIERS.length - 1];
}

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!aura <name | @user>`').setTimestamp()],
    });
  }

  const mention  = message.mentions.members?.first();
  const target   = mention ? mention.displayName : args.join(' ');

  // 2% chance of infinite aura
  const isInfinite = Math.random() < 0.02;
  let points, displayPoints;

  if (isInfinite) {
    points        = Infinity;
    displayPoints = '∞  **INFINITE**';
  } else {
    // Random -100 to 1000
    points        = Math.floor(Math.random() * 1101) - 100;
    displayPoints = `**${points > 0 ? '+' : ''}${points}**`;
  }

  const tier = getTier(points, isInfinite);
  const line = AURA_LINES[Math.floor(Math.random() * AURA_LINES.length)];

  // Visual bar for finite values (map -100→1000 onto 0–10 blocks)
  let barStr;
  if (isInfinite) {
    barStr = '█'.repeat(10) + ' ∞';
  } else {
    const normalized = (points + 100) / 1100; // 0.0 – 1.0
    const filled     = Math.round(normalized * 10);
    barStr           = `\`${'█'.repeat(filled) + '░'.repeat(10 - filled)}\`  ${points > 0 ? '+' : ''}${points} pts`;
  }

  const embed = new EmbedBuilder()
    .setColor(tier.color)
    .setTitle('✨  Aura Reading')
    .setDescription(`*"${line}"*`)
    .addFields(
      { name: 'Target',      value: target,                              inline: true },
      { name: 'Aura Points', value: displayPoints,                       inline: true },
      { name: 'Type',        value: `${tier.emoji}  **${tier.label}**`, inline: true },
      { name: 'Aura Bar',    value: barStr,                              inline: false },
    )
    .setFooter({ text: `Range: -100 to +1000  •  Scanned by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Measure someone\'s aura points (-100 to +1000, or infinite)',
  usage: 'aura <name | @user>',
  category: 'Fun',
};
