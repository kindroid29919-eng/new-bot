/**
 * ban.js — x!ban
 * Bans a mentioned member from the server.
 * Requires: Ban Members permission for both the bot and the command user.
 *
 * Usage: x!ban <@user> [reason]
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  // ── Permission check ────────────────────────────────────────────────────────
  if (!message.member.permissions.has('BanMembers')) {
    return message.reply({ embeds: [noPermEmbed('You need the **Ban Members** permission to use this.')] });
  }
  if (!message.guild.members.me.permissions.has('BanMembers')) {
    return message.reply({ embeds: [noPermEmbed('I need the **Ban Members** permission to do that.')] });
  }

  // ── Target resolution ───────────────────────────────────────────────────────
  const target = message.mentions.members.first();
  if (!target) {
    return message.reply({ embeds: [usageEmbed()] });
  }

  if (!target.bannable) {
    return message.reply({ embeds: [errorEmbed('I cannot ban that member. They may have a higher role than me.')] });
  }

  if (target.id === message.author.id) {
    return message.reply({ embeds: [errorEmbed('You cannot ban yourself.')] });
  }

  const reason = args.slice(1).join(' ') || 'No reason provided.';

  // ── Execute ─────────────────────────────────────────────────────────────────
  try {
    await target.ban({ reason: `${message.author.tag}: ${reason}` });

    const embed = new EmbedBuilder()
      .setColor(0xff4757)
      .setTitle('🔨  Member Banned')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Banned by', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[ban]', err);
    await message.reply({ embeds: [errorEmbed('Failed to ban that member.')] });
  }
}

function noPermEmbed(desc) {
  return new EmbedBuilder().setColor(0xff6b81).setTitle('🚫  No Permission').setDescription(desc).setTimestamp();
}

function errorEmbed(desc) {
  return new EmbedBuilder().setColor(0xff4757).setTitle('❌  Error').setDescription(desc).setTimestamp();
}

function usageEmbed() {
  return new EmbedBuilder()
    .setColor(0xff4757)
    .setTitle('❌  Invalid Usage')
    .setDescription('**Usage:** `x!ban <@user> [reason]`\n**Example:** `x!ban @Ahad spamming`')
    .setTimestamp();
}

module.exports = {
  execute,
  description: 'Ban a member from the server',
  usage: 'ban <@user> [reason]',
  category: 'Moderation',
};
