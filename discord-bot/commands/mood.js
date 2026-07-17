/**
 * mood.js — x!mood <user>
 * Randomly determines someone's current mood.
 * Usage: x!mood <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const MOODS = [
  { label: 'Chaotic',        emoji: '🤪', color: 0xff6b81 },
  { label: 'Sleepy',         emoji: '😴', color: 0x7bed9f },
  { label: 'Hangry',         emoji: '😡', color: 0xff4757 },
  { label: 'Vibing',         emoji: '😎', color: 0x70a1ff },
  { label: 'Overthinking',   emoji: '😵‍💫', color: 0xf9ca24 },
  { label: 'Locked In',      emoji: '🔒', color: 0x2ed573 },
  { label: 'Touch Grass Needed', emoji: '🌱', color: 0x1abc9c },
  { label: 'Feral',          emoji: '🐺', color: 0xa55eea },
  { label: 'Zen',            emoji: '🧘', color: 0x54a0ff },
  { label: 'Suspicious',     emoji: '🤨', color: 0xffa502 },
];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!mood <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const mood    = MOODS[Math.floor(Math.random() * MOODS.length)];

  const embed = new EmbedBuilder()
    .setColor(mood.color)
    .setTitle('🎭  Mood Check')
    .setDescription(`${target} is currently feeling...\n\n${mood.emoji}  **${mood.label}**`)
    .setFooter({ text: `Checked by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'mood',
  aliases: [],
  description: "Randomly checks someone's mood",
  usage: 'mood <name | @user>',
  category: 'Personality',
};
