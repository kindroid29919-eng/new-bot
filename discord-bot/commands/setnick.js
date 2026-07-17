/**
 * setnick.js — x!setnick (alias: sn)
 * Sets or resets a member's nickname.
 * Usage: x!setnick <@user> <new nickname | reset>
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

async function execute(message, args) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Missing Permission').setDescription('You need the `Manage Nicknames` permission to use this.').setTimestamp()],
    });
  }

  const member = message.mentions.members?.first();
  if (!member) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!setnick <@user> <new nickname | reset>`').setTimestamp()],
    });
  }

  const rest = args.slice(1).join(' ').trim();
  if (!rest) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Missing Nickname').setDescription('Provide a nickname, or `reset` to clear it.').setTimestamp()],
    });
  }

  if (!member.manageable) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Cannot Modify').setDescription('I cannot change this member\'s nickname (role hierarchy).').setTimestamp()],
    });
  }

  const newNick = rest.toLowerCase() === 'reset' ? null : rest;
  const oldNick = member.displayName;

  try {
    await member.setNickname(newNick, `Changed by ${message.author.tag}`);
  } catch (err) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Failed').setDescription(`Could not change nickname: ${err.message}`).setTimestamp()],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ed573)
    .setTitle('✏️  Nickname Updated')
    .addFields(
      { name: 'Member', value: `${member}`,                      inline: true },
      { name: 'Before', value: oldNick,                          inline: true },
      { name: 'After',  value: newNick || member.user.username,  inline: true },
    )
    .setFooter({ text: `Changed by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'setnick',
  aliases: ['sn'],
  description: 'Sets or resets a member\'s nickname',
  usage: 'setnick <@user> <new nickname | reset>',
  category: 'Moderation',
};
