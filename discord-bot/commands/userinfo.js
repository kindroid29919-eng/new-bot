/**
 * userinfo.js — x!userinfo (alias: ui)
 * Shows information about a server member.
 * Usage: x!userinfo [@user]
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  const member = message.mentions.members?.first()
    || message.guild.members.cache.get(args[0])
    || message.member;

  if (!member) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  User Not Found').setDescription('Could not find that member.').setTimestamp()],
    });
  }

  const roles = member.roles.cache
    .filter(r => r.id !== message.guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => `<@&${r.id}>`)
    .slice(0, 10);

  const embed = new EmbedBuilder()
    .setColor(member.displayHexColor || 0x2f3136)
    .setTitle(`👤  ${member.user.tag}`)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: 'User ID',         value: member.id,                                                    inline: true },
      { name: 'Nickname',        value: member.nickname || 'None',                                   inline: true },
      { name: 'Bot',             value: member.user.bot ? 'Yes' : 'No',                               inline: true },
      { name: 'Joined Server',   value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,          inline: false },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,   inline: false },
      { name: `Roles [${roles.length}]`, value: roles.length ? roles.join(', ') : 'None',              inline: false },
    )
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'userinfo',
  aliases: ['ui'],
  description: 'Shows information about a member',
  usage: 'userinfo [@user]',
  category: 'Utility',
};
