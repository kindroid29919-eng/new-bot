/**
 * roleinfo.js — x!roleinfo (alias: ri)
 * Shows information about a server role.
 * Usage: x!roleinfo <@role | role name | role id>
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!roleinfo <@role | role name | role id>`').setTimestamp()],
    });
  }

  const mentionedRole = message.mentions.roles.first();
  const query = args.join(' ');
  const role = mentionedRole
    || message.guild.roles.cache.get(query)
    || message.guild.roles.cache.find(r => r.name.toLowerCase() === query.toLowerCase());

  if (!role) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Role Not Found').setDescription(`Could not find a role matching \`${query}\`.`).setTimestamp()],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(role.color || 0x2f3136)
    .setTitle(`🎭  ${role.name}`)
    .addFields(
      { name: 'Role ID',     value: role.id,                                            inline: true },
      { name: 'Color',       value: role.hexColor,                                      inline: true },
      { name: 'Position',    value: `${role.position}`,                                inline: true },
      { name: 'Members',     value: `${role.members.size}`,                            inline: true },
      { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No',                   inline: true },
      { name: 'Hoisted',     value: role.hoist ? 'Yes' : 'No',                         inline: true },
      { name: 'Created',     value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: false },
    )
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'roleinfo',
  aliases: ['ri'],
  description: 'Shows information about a role',
  usage: 'roleinfo <@role | role name | role id>',
  category: 'Utility',
};
