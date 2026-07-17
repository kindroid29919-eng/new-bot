const { EmbedBuilder } = require('discord.js');
const { captions, emojis } = require('../data/waifus.js');
const { getGif } = require('../utils/nekosGif.js');

async function execute(message, args) {
  const caption = captions[Math.floor(Math.random() * captions.length)];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle(`${emoji}  Waifu`)
    .setDescription(caption)
    .setTimestamp();

  const image = await getGif('waifu');
  if (image) {
    embed.setImage(image.url);
    if (image.artist_name) embed.setFooter({ text: `Artist: ${image.artist_name}` });
  } else {
    embed.setDescription(`${caption}\n\n*(Couldn't reach the image source right now — try again in a bit.)*`);
  }

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'waifu', aliases: [], description: 'Get a random waifu image!', usage: 'waifu', category: 'Social' };
