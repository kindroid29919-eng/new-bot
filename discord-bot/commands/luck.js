/**
 * luck.js — x!luck
 * Shows today's luck percentage for someone.
 * Result is seeded by name + today's date so the same person gets
 * the same luck all day — but it resets every midnight.
 *
 * Usage: x!luck <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const TIERS = [
  { min: 100, max: 100, label: 'Divinely Blessed',  emoji: '✨', color: 0xffd32a },
  { min: 86,  max: 99,  label: 'Very Lucky',        emoji: '🍀', color: 0x2ed573 },
  { min: 71,  max: 85,  label: 'Lucky',             emoji: '🌟', color: 0x00b894 },
  { min: 56,  max: 70,  label: 'Pretty Lucky',      emoji: '🎲', color: 0x74b9ff },
  { min: 41,  max: 55,  label: 'Average',           emoji: '😐', color: 0xa29bfe },
  { min: 26,  max: 40,  label: 'Below Average',     emoji: '🌧️', color: 0xfdcb6e },
  { min: 11,  max: 25,  label: 'Unlucky',           emoji: '🍂', color: 0xe17055 },
  { min: 0,   max: 10,  label: 'Cursed',            emoji: '😈', color: 0xff4757 },
];

const LUCK_LINES = [
  'The stars have spoken.',
  'Fate rolled the dice.',
  'The universe checked its notes.',
  'Mercury retrograde may be involved.',
  'The algorithm has decided.',
  'The fortune cookie agrees.',
  'Destiny has logged in.',
  'The cosmic spreadsheet has been updated.',
];

/** Simple deterministic hash → 0–100 */
function seedLuck(name, dateStr) {
  const raw = `${name.toLowerCase()}::${dateStr}`;
  let hash  = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash % 101; // 0–100
}

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
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!luck <name | @user>`').setTimestamp()],
    });
  }

  const mention   = message.mentions.members?.first();
  const target    = mention ? mention.displayName : args.join(' ');

  // Seed by target name + today's UTC date
  const today     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const pct       = seedLuck(target, today);
  const tier      = getTier(pct);
  const line      = LUCK_LINES[Math.floor(Math.random() * LUCK_LINES.length)];

  const embed = new EmbedBuilder()
    .setColor(tier.color)
    .setTitle('🍀  Daily Luck')
    .setDescription(`*"${line}"*`)
    .addFields(
      { name: 'Target',    value: target,                              inline: true },
      { name: 'Luck %',    value: `**${pct}%**`,                      inline: true },
      { name: 'Status',    value: `${tier.emoji}  **${tier.label}**`, inline: true },
      { name: 'Luck Bar',  value: `\`${bar(pct)}\`  ${pct}%`,       inline: false },
    )
    .setFooter({ text: `Resets at midnight UTC  •  Checked by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: "Check someone's luck percentage for today (resets at midnight)",
  usage: 'luck <name | @user>',
  category: 'Fun',
};
