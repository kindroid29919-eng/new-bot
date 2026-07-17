const { EmbedBuilder } = require('discord.js');
const { captions, emojis } = require('../data/cries.js');
const { getGif } = require('../utils/nekosGif.js');

async function execute(message, args) {
  const caption = captions[Math.floor(Math.random() * captions.length)];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const embed = new EmbedBuilder()
    .setColor(0x74b9ff)
    .setTitle(`${emoji}  Crying`)
    .setDescription(`**${message.author.username}** ${caption}`)
    .setTimestamp();

  const gif = await getGif('cry');
  if (gif) {
    embed.setImage(gif.url);
    if (gif.anime_name) embed.setFooter({ text: `Source: ${gif.anime_name}` });
  }

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'cry', aliases: ['sob'], description: 'Have a dramatic anime cry moment!', usage: 'cry', category: 'Social' };
