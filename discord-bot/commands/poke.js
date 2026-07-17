const { EmbedBuilder } = require('discord.js');
const { reasons, reactions, emojis } = require('../data/pokes.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!poke <user>`').setTimestamp()],
    });
  }

  const targetName = message.mentions.users.first()?.username || args.join(' ');
  let cacheKey, reason, reaction, attempts = 0;

  do {
    reason = reasons[Math.floor(Math.random() * reasons.length)];
    reaction = reactions[Math.floor(Math.random() * reactions.length)];
    cacheKey = `${reason}-${reaction}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const embed = new EmbedBuilder()
    .setColor(0xff9f43)
    .setTitle(`${emoji}  *Boop!*`)
    .setDescription(`**${message.author.username}** poked **${targetName}**!`)
    .addFields(
      { name: 'Reason', value: reason, inline: true },
      { name: 'Reaction', value: reaction, inline: true }
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'poke', aliases: ['boop', 'prod'], description: 'Playfully poke another user!', usage: 'poke <user>', category: 'Social' };
