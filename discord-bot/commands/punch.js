const { EmbedBuilder } = require('discord.js');
const { styles, sounds, reactions } = require('../data/punches.js');
const { getGif } = require('../utils/nekosGif.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!punch <user>`').setTimestamp()],
    });
  }

  const targetName = message.mentions.users.first()?.username || args.join(' ');
  let cacheKey, style, sound, reaction, attempts = 0;

  do {
    style = styles[Math.floor(Math.random() * styles.length)];
    sound = sounds[Math.floor(Math.random() * sounds.length)];
    reaction = reactions[Math.floor(Math.random() * reactions.length)];
    cacheKey = `${style}-${reaction}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('👊  POW!')
    .setDescription(`**${message.author.username}** hit **${targetName}** with ${style}!`)
    .addFields(
      { name: 'Sound', value: `**${sound}**`, inline: true },
      { name: 'Result', value: reaction, inline: true }
    )
    .setTimestamp();

  const gif = await getGif('punch');
  const footerBase = 'No actual users were harmed in the making of this punch.';
  embed.setFooter({ text: gif?.anime_name ? `${footerBase} · Source: ${gif.anime_name}` : footerBase });
  if (gif) embed.setImage(gif.url);

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'punch', aliases: ['sock'], description: 'Throw a cartoonish punch at someone!', usage: 'punch <user>', category: 'Social' };
