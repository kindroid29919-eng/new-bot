const { EmbedBuilder } = require('discord.js');
const { locations, vehicles, roles } = require('../data/kidnaps.js');

const recentCache = [];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!kidnap <user>`').setTimestamp()],
    });
  }

  const targetName = message.mentions.users.first()?.username || args.join(' ');
  let cacheKey, location, vehicle, role, attempts = 0;

  do {
    location = locations[Math.floor(Math.random() * locations.length)];
    vehicle = vehicles[Math.floor(Math.random() * vehicles.length)];
    role = roles[Math.floor(Math.random() * roles.length)];
    cacheKey = `${location}-${vehicle}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🛸  Unexpected Relocation')
    .setDescription(`**${message.author.username}** successfully kidnapped **${targetName}**!`)
    .addFields(
      { name: 'Transport Method', value: vehicle, inline: true },
      { name: 'Accomplices', value: role, inline: true },
      { name: 'Destination', value: location, inline: false }
    )
    .setFooter({ text: 'Don\'t worry, they will be returned by 8 PM.' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'kidnap', aliases: ['steal', 'abduct'], description: 'Whisk someone away to a fun location!', usage: 'kidnap <user>', category: 'Social' };
