/**
 * vibe.js — x!vibe <user>
 * Checks someone's current vibe rating and description.
 * Usage: x!vibe <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const VIBES = [
  { label: 'Immaculate',      emoji: '✨', color: 0x2ed573 },
  { label: 'Chill',           emoji: '🌊', color: 0x70a1ff },
  { label: 'Unhinged',        emoji: '🌀', color: 0xa55eea },
  { label: 'Main Character',  emoji: '🎬', color: 0xff6b81 },
  { label: 'NPC',             emoji: '🤖', color: 0x7f8fa6 },
  { label: 'Mysterious',      emoji: '🕵️', color: 0x2f3542 },
  { label: 'Cozy',            emoji: '☕', color: 0xe1b382 },
  { label: 'Menace',          emoji: '😈', color: 0xff4757 },
  { label: 'Wholesome',       emoji: '🥹', color: 0xf9ca24 },
];

function bar(pct) {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!vibe <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const vibe    = VIBES[Math.floor(Math.random() * VIBES.length)];
  const pct     = Math.floor(Math.random() * 101);

  const embed = new EmbedBuilder()
    .setColor(vibe.color)
    .setTitle('🌈  Vibe Check')
    .addFields(
      { name: 'Target',    value: target,                            inline: true },
      { name: 'Vibe',      value: `${vibe.emoji}  **${vibe.label}**`, inline: true },
      { name: 'Vibe Score',value: `**${pct}%**`,                     inline: true },
      { name: 'Vibe Bar',  value: `\`${bar(pct)}\`  ${pct}%`,       inline: false },
    )
    .setFooter({ text: `Checked by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'vibe',
  aliases: [],
  description: "Checks someone's current vibe",
  usage: 'vibe <name | @user>',
  category: 'Personality',
};
