/**
 * simp.js — x!simp
 * Calculates someone's simp percentage.
 * Usage: x!simp <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const TIERS = [
  { min: 100, max: 100, label: 'Irredeemable',        emoji: '💘', color: 0xff0044 },
  { min: 86,  max: 99,  label: 'Terminally Simp',     emoji: '🪦', color: 0xff4757 },
  { min: 71,  max: 85,  label: 'Dangerously Down Bad', emoji: '😭', color: 0xff6b81 },
  { min: 56,  max: 70,  label: 'Down Bad',             emoji: '💀', color: 0xffa502 },
  { min: 41,  max: 55,  label: 'Full-Time Simp',       emoji: '😔', color: 0xfdcb6e },
  { min: 26,  max: 40,  label: 'Certified Simp',       emoji: '💌', color: 0xf9ca24 },
  { min: 11,  max: 25,  label: 'Mild Simp',            emoji: '🙂', color: 0xa8e6cf },
  { min: 0,   max: 10,  label: 'Not a Simp',           emoji: '😎', color: 0x2ed573 },
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
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!simp <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const pct     = Math.floor(Math.random() * 101);
  const tier    = getTier(pct);

  const embed = new EmbedBuilder()
    .setColor(tier.color)
    .setTitle('💘  Simp Meter')
    .addFields(
      { name: 'Target',       value: target,                                   inline: true },
      { name: 'Simp %',       value: `**${pct}%**`,                            inline: true },
      { name: 'Level',        value: `${tier.emoji}  **${tier.label}**`,       inline: true },
      { name: 'Simp Bar',     value: `\`${bar(pct)}\`  ${pct}%`,              inline: false },
    )
    .setFooter({ text: `Checked by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Check someone\'s simp percentage',
  usage: 'simp <name | @user>',
  category: 'Fun',
};
