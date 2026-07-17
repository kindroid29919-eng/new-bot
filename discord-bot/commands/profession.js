/**
 * profession.js — x!profession <user>
 * Assigns a random fake profession to someone.
 * Usage: x!profession <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const PROFESSIONS = [
  'Professional Meme Reviewer',
  'Certified Vibe Curator',
  'Freelance Chaos Coordinator',
  'Senior Couch Potato',
  'Discord Mod (unpaid)',
  'Full-Time Overthinker',
  'Amateur Conspiracy Theorist',
  'Snack Quality Assurance Tester',
  'Part-Time Wizard',
  'Professional Lurker',
  'Emotional Support Goblin',
  'Head of Pixel Pushing',
  'WiFi Signal Whisperer',
  'Certified Nap Enthusiast',
  'Regional Manager of Bad Decisions',
  'Rubber Duck Debugging Consultant',
  'Chief Vibes Officer',
  'Undercover Cat',
  'Professional Overreactor',
  'Keyboard Warrior (Retired)',
];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!profession <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const job     = PROFESSIONS[Math.floor(Math.random() * PROFESSIONS.length)];

  const embed = new EmbedBuilder()
    .setColor(0x70a1ff)
    .setTitle('💼  Career Assignment')
    .setDescription(`${target}'s true calling is...\n\n**${job}**`)
    .setFooter({ text: `Assigned by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'profession',
  aliases: [],
  description: 'Random fake profession generator',
  usage: 'profession <name | @user>',
  category: 'Personality',
};
