const { EmbedBuilder } = require('discord.js');
const { statuses, comments, outcomes, emojis } = require('../data/marrys.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!marry <user>`').setTimestamp()],
    });
  }

  const targetName = message.mentions.users.first()?.username || args.join(' ');
  const percentage = Math.floor(Math.random() * 101);

  let cacheKey;
  let attempts = 0;
  let status, comment, outcome;

  do {
    status = statuses[Math.floor(Math.random() * statuses.length)];
    comment = comments[Math.floor(Math.random() * comments.length)];
    outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    cacheKey = `${status}-${comment}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const embed = new EmbedBuilder()
    .setColor(0xff9ff3)
    .setTitle(`${emoji}  Marriage License`)
    .setDescription(`Officiating the union between **${message.author.username}** and **${targetName}**...`)
    .addFields(
      { name: 'Compatibility', value: `**${percentage}%**`, inline: true },
      { name: 'Status', value: `*${status}*`, inline: true },
      { name: 'Outcome', value: outcome, inline: false },
      { name: 'Officiant\'s Note', value: comment, inline: false }
    )
    .setFooter({ text: `Officiated by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'marry', aliases: ['wed', 'propose'], description: 'Propose to another user!', usage: 'marry <user>', category: 'Social' };
