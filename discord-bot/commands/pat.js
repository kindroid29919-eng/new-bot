const { EmbedBuilder } = require('discord.js');
const { styles, reactions, emojis } = require('../data/pats.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!pat <user>`').setTimestamp()],
    });
  }

  const targetName = message.mentions.users.first()?.username || args.join(' ');
  let cacheKey, style, reaction, attempts = 0;

  do {
    style = styles[Math.floor(Math.random() * styles.length)];
    reaction = reactions[Math.floor(Math.random() * reactions.length)];
    cacheKey = `${style}-${reaction}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const embed = new EmbedBuilder()
    .setColor(0xfeca57)
    .setTitle(`${emoji}  *Pat Pat*`)
    .setDescription(`**${message.author.username}** gave **${targetName}** some ${style}.`)
    .addFields({ name: 'Reaction', value: reaction, inline: false })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'pat', aliases: ['pet', 'headpat'], description: 'Give someone cute head pats!', usage: 'pat <user>', category: 'Social' };
