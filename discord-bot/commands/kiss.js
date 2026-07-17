const { EmbedBuilder } = require('discord.js');
const { styles, messages, emojis } = require('../data/kisses.js');
const { getGif } = require('../utils/nekosGif.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!kiss <user>`').setTimestamp()],
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
    .setColor(0xff6b9d)
    .setTitle(`${emoji}  Smooch!`)
    .setDescription(`**${message.author.username}** gave **${targetName}** ${style}!`)
    .addFields({ name: 'Result', value: msg, inline: false })
    .setTimestamp();

  const gif = await getGif('kiss');
  if (gif) {
    embed.setImage(gif.url);
    if (gif.anime_name) embed.setFooter({ text: `Source: ${gif.anime_name}` });
  }

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'kiss', aliases: ['smooch'], description: 'Give someone a sweet kiss!', usage: 'kiss <user>', category: 'Social' };
