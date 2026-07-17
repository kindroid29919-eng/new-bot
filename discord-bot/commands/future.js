/**
 * future.js — x!future <user>
 * Generates a funny future prediction for someone.
 * Usage: x!future <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

const PREDICTIONS = [
  'will become internet famous for something extremely mundane',
  'will accidentally start a small cult',
  'will marry their favorite anime character (in their heart)',
  'will win an argument with a vending machine',
  'will become the CEO of a company that sells air',
  'will get lost trying to find the bathroom at their own wedding',
  'will be knighted for services to procrastination',
  'will discover time travel and use it to skip Mondays',
  'will become a legendary NPC in someone else\'s story',
  'will retire early after winning a meme contest',
  'will be elected mayor of a Discord server',
  'will finally beat that one level after 10 years',
  'will become fluent in a language nobody speaks anymore',
  'will open a restaurant that only serves cereal',
  'will be the reason a new law gets written',
];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!future <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');
  const pred    = PREDICTIONS[Math.floor(Math.random() * PREDICTIONS.length)];

  const embed = new EmbedBuilder()
    .setColor(0xa55eea)
    .setTitle('🔮  Future Prediction')
    .setDescription(`In the future, **${target}** ${pred}.`)
    .setFooter({ text: `Predicted by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'future',
  aliases: [],
  description: 'Funny future prediction generator',
  usage: 'future <name | @user>',
  category: 'Personality',
};
