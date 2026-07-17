/**
 * sus.js — x!sus
 * Shows how sus someone is (0–100%).
 * Usage: x!sus <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const TIERS = [
  { min: 100, max: 100, label: 'Ejected',              emoji: '☠️',  color: 0x2c2c2c },
  { min: 86,  max: 99,  label: 'Mega Sus',             emoji: '🚨', color: 0xff0000 },
  { min: 71,  max: 85,  label: 'Very Sus',             emoji: '📮', color: 0xff4757 },
  { min: 51,  max: 70,  label: 'Pretty Sus',           emoji: '🔴', color: 0xff6348 },
  { min: 31,  max: 50,  label: 'Kind of Sus',          emoji: '🟠', color: 0xffa502 },
  { min: 16,  max: 30,  label: 'Slightly Suspicious',  emoji: '🟡', color: 0xffd32a },
  { min: 0,   max: 15,  label: 'Clear',                emoji: '🟢', color: 0x2ed573 },
];

const SUS_LINES = [
  'The vents were used.',
  'There is one impostor among us.',
  'No alibi. No evidence. Just vibes.',
  'Skipped voting. Classic.',
  'Was seen near the body.',
  'Reported the body suspiciously fast.',
  'Called an emergency meeting for no reason.',
  'Followed someone into electrical.',
  'Did tasks? We\'re not sure.',
  'The reactor sabotage timing was too convenient.',
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
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!sus <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const pct     = Math.floor(Math.random() * 101);
  const tier    = getTier(pct);
  const line    = SUS_LINES[Math.floor(Math.random() * SUS_LINES.length)];

  const embed = new EmbedBuilder()
    .setColor(tier.color)
    .setTitle('📮  Sus Meter')
    .setDescription(`*"${line}"*`)
    .addFields(
      { name: 'Target',   value: target,                             inline: true },
      { name: 'Sus %',    value: `**${pct}%**`,                     inline: true },
      { name: 'Verdict',  value: `${tier.emoji}  **${tier.label}**`, inline: true },
      { name: 'Sus Bar',  value: `\`${bar(pct)}\`  ${pct}%`,       inline: false },
    )
    .setFooter({ text: `Reported by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Check how sus someone is (0–100%)',
  usage: 'sus <name | @user>',
  category: 'Fun',
};
