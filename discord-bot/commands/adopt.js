const { EmbedBuilder } = require('discord.js');
const { results, guardians, conditions, emojis } = require('../data/adopts.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!adopt <user>`').setTimestamp()],
    });
  }

  const targetName = message.mentions.users.first()?.username || args.join(' ');
  let cacheKey, result, guardian, condition, attempts = 0;

  do {
    result = results[Math.floor(Math.random() * results.length)];
    guardian = guardians[Math.floor(Math.random() * guardians.length)];
    condition = conditions[Math.floor(Math.random() * conditions.length)];
    cacheKey = `${result}-${guardian}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  let report = `**${message.author.username}** applied to adopt **${targetName}**.\n\n`;
  report += `**Status:** ${result}\n`;

  if (result.includes('Approved') || result.includes('Accepted')) {
    report += `**Co-Sponsor:** ${guardian}\n`;
    report += `**Condition:** They ${condition}`;
  } else if (result.includes('Pending') || result.includes('Waitlisted')) {
    report += `**Reason:** Awaiting background check by ${guardian}.`;
  } else {
    report += `**Reason:** ${guardian} objected to the adoption.`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x48dbfb)
    .setTitle(`${emoji}  Adoption Agency`)
    .setDescription(report)
    .setFooter({ text: `Processed by the Social Department` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'adopt', aliases: ['claim'], description: 'Try to adopt someone!', usage: 'adopt <user>', category: 'Social' };
