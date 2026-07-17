/**
 * cringe.js — x!cringe
 * Measures someone's cringe level (0–100%).
 * Usage: x!cringe <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const TIERS = [
  { min: 100, max: 100, label: 'Chronically Cringe',        emoji: '🪦', color: 0x2c2c2c },
  { min: 86,  max: 99,  label: 'Unhinged Cringe',           emoji: '💀', color: 0xff4757 },
  { min: 71,  max: 85,  label: 'Second-Hand Embarrassment', emoji: '😖', color: 0xff6b81 },
  { min: 51,  max: 70,  label: 'Hard Cringe',               emoji: '🫠', color: 0xffa502 },
  { min: 31,  max: 50,  label: 'Certified Cringe',          emoji: '😣', color: 0xfdcb6e },
  { min: 16,  max: 30,  label: 'Mildly Cringe',             emoji: '😬', color: 0xf9ca24 },
  { min: 0,   max: 15,  label: 'Smooth',                    emoji: '😎', color: 0x2ed573 },
];

const CRINGE_LINES = [
  'The chat went silent.',
  'Someone left the call.',
  'Three people muted their mic.',
  'The room temperature dropped.',
  'Nobody acknowledged it. Out of respect.',
  'A tumbleweed rolled through.',
  'We are all processing this together.',
  'We agreed never to speak of this.',
  'The historians have been notified.',
  'The internet has seen this. It cannot unsee it.',
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
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!cringe <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const pct     = Math.floor(Math.random() * 101);
  const tier    = getTier(pct);
  const line    = CRINGE_LINES[Math.floor(Math.random() * CRINGE_LINES.length)];

  const embed = new EmbedBuilder()
    .setColor(tier.color)
    .setTitle('😬  Cringe Meter')
    .setDescription(`*"${line}"*`)
    .addFields(
      { name: 'Target',      value: target,                              inline: true },
      { name: 'Cringe %',   value: `**${pct}%**`,                      inline: true },
      { name: 'Level',       value: `${tier.emoji}  **${tier.label}**`, inline: true },
      { name: 'Cringe Bar',  value: `\`${bar(pct)}\`  ${pct}%`,       inline: false },
    )
    .setFooter({ text: `Witnessed by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: "Measure someone's cringe level (0–100%)",
  usage: 'cringe <name | @user>',
  category: 'Fun',
};
