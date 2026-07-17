const { EmbedBuilder } = require('discord.js');
const { objects, sounds, reactions } = require('../data/slaps.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!slap <user>`').setTimestamp()],
    });
  }

  const targetName = message.mentions.users.first()?.username || args.join(' ');
  let cacheKey, object, sound, reaction, attempts = 0;

  do {
    object = objects[Math.floor(Math.random() * objects.length)];
    sound = sounds[Math.floor(Math.random() * sounds.length)];
    reaction = reactions[Math.floor(Math.random() * reactions.length)];
    cacheKey = `${object}-${reaction}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('💥  SLAP!')
    .setDescription(`**${message.author.username}** slapped **${targetName}** with ${object}!`)
    .addFields(
      { name: 'Sound', value: `**${sound}**`, inline: true },
      { name: 'Impact', value: reaction, inline: true }
    )
    .setFooter({ text: 'No actual users were harmed in the making of this slap.' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'slap', aliases: ['smack', 'whack'], description: 'Slap someone with a cartoonish object!', usage: 'slap <user>', category: 'Social' };
