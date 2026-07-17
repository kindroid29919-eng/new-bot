/**
 * 8ball.js — x!8ball <question>
 * Classic magic 8-ball.
 * Usage: x!8ball <question>
 */

const { EmbedBuilder } = require('discord.js');

const ANSWERS = [
  'It is certain.',
  'Without a doubt.',
  'Yes, definitely.',
  'You may rely on it.',
  'As I see it, yes.',
  'Most likely.',
  'Outlook good.',
  'Signs point to yes.',
  'Reply hazy, try again.',
  'Ask again later.',
  'Better not tell you now.',
  'Cannot predict now.',
  'Concentrate and ask again.',
  "Don't count on it.",
  'My reply is no.',
  'My sources say no.',
  'Outlook not so good.',
  'Very doubtful.',
];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!8ball <question>`').setTimestamp()],
    });
  }

  const question = args.join(' ');
  const answer   = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

  const embed = new EmbedBuilder()
    .setColor(0x2f3542)
    .setTitle('🎱  Magic 8-Ball')
    .addFields(
      { name: 'Question', value: question, inline: false },
      { name: 'Answer',   value: `**${answer}**`, inline: false },
    )
    .setFooter({ text: `Asked by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: '8ball',
  aliases: [],
  description: 'Ask the magic 8-ball a question',
  usage: '8ball <question>',
  category: 'Mini Games',
};
