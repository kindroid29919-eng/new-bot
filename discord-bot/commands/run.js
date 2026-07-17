const { EmbedBuilder } = require('discord.js');
const { captions, emojis } = require('../data/runs.js');
const { getGif } = require('../utils/nekosGif.js');

async function execute(message, args) {
  const caption = captions[Math.floor(Math.random() * captions.length)];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle(`${emoji}  Running`)
    .setDescription(`**${message.author.username}** ${caption}`)
    .setTimestamp();

  const gif = await getGif('run');
  if (gif) {
    embed.setImage(gif.url);
    if (gif.anime_name) embed.setFooter({ text: `Source: ${gif.anime_name}` });
  }

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'run', aliases: ['flee', 'dash'], description: 'Make a dramatic anime run!', usage: 'run', category: 'Social' };
