/**
 * softban.js — x!softban
 * Bans then immediately unbans a member — wipes their recent messages
 * without leaving a permanent ban.
 * Usage: x!softban <@user> [days=1] [reason]
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

async function execute(message, args) {
  if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Missing Permission').setDescription('You need the `Ban Members` permission to use this.').setTimestamp()],
    });
  }

  const member = message.mentions.members?.first();
  if (!member) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!softban <@user> [days=1] [reason]`').setTimestamp()],
    });
  }

  if (!member.bannable) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Cannot Softban').setDescription('I cannot ban this member (role hierarchy or missing permissions).').setTimestamp()],
    });
  }

  const rest = args.slice(1);
  let days = 1;
  if (rest[0] && !isNaN(rest[0])) {
    days = Math.min(7, Math.max(0, parseInt(rest[0], 10)));
    rest.shift();
  }
  const reason = rest.join(' ') || 'No reason provided';

  try {
    await message.guild.members.ban(member.id, {
      deleteMessageSeconds: days * 86400,
      reason: `Softban by ${message.author.tag}: ${reason}`,
    });
    await message.guild.members.unban(member.id, `Softban cleanup by ${message.author.tag}`);
  } catch (err) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Failed').setDescription(`Could not softban: ${err.message}`).setTimestamp()],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0xffa502)
    .setTitle('🔨  Member Softbanned')
    .addFields(
      { name: 'Member',         value: `${member.user.tag}`, inline: true },
      { name: 'Messages Wiped', value: `${days} day(s)`,     inline: true },
      { name: 'Reason',         value: reason,               inline: false },
    )
    .setFooter({ text: `Softbanned by ${message.author.tag}` })
    .setTimestamp();

  await message.channel.send({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'softban',
  aliases: [],
  description: 'Bans and instantly unbans a member (wipes recent messages)',
  usage: 'softban <@user> [days] [reason]',
  category: 'Moderation',
};
