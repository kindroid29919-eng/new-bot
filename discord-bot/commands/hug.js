const { EmbedBuilder } = require('discord.js');
const { styles, messages, emojis } = require('../data/hugs.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!hug <user>`').setTimestamp()],
    });
  }

  const targetName = message.mentions.users.first()?.username || args.join(' ');
  let cacheKey, style, msg, attempts = 0;

  do {
    style = styles[Math.floor(Math.random() * styles.length)];
    msg = messages[Math.floor(Math.random() * messages.length)];
    cacheKey = `${style}-${msg}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const embed = new EmbedBuilder()
    .setColor(0x1dd1a1)
    .setTitle(`${emoji}  Incoming Hug!`)
    .setDescription(`**${message.author.username}** gave **${targetName}** ${style}!`)
    .addFields({ name: 'Result', value: msg, inline: false })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'hug', aliases: ['cuddle', 'embrace'], description: 'Give someone a wholesome hug!', usage: 'hug <user>', category: 'Social' };
