/**
 * kick.js — x!kick
 * Kicks a mentioned member from the server.
 * Requires: Kick Members permission for both the bot and the command user.
 *
 * Usage: x!kick <@user> [reason]
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  // ── Permission check ────────────────────────────────────────────────────────
  if (!message.member.permissions.has('KickMembers')) {
    return message.reply({ embeds: [noPermEmbed('You need the **Kick Members** permission to use this.')] });
  }
  if (!message.guild.members.me.permissions.has('KickMembers')) {
    return message.reply({ embeds: [noPermEmbed('I need the **Kick Members** permission to do that.')] });
  }

  // ── Target resolution ───────────────────────────────────────────────────────
  const target = message.mentions.members.first();
  if (!target) {
    return message.reply({ embeds: [usageEmbed()] });
  }

  if (!target.kickable) {
    return message.reply({ embeds: [errorEmbed('I cannot kick that member. They may have a higher role than me.')] });
  }

  if (target.id === message.author.id) {
    return message.reply({ embeds: [errorEmbed('You cannot kick yourself.')] });
  }

  const reason = args.slice(1).join(' ') || 'No reason provided.';

  // ── Execute ─────────────────────────────────────────────────────────────────
  try {
    await target.kick(`${message.author.tag}: ${reason}`);

    const embed = new EmbedBuilder()
      .setColor(0xffa502)
      .setTitle('👢  Member Kicked')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Kicked by', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[kick]', err);
    await message.reply({ embeds: [errorEmbed('Failed to kick that member.')] });
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
    .setDescription('**Usage:** `x!kick <@user> [reason]`\n**Example:** `x!kick @Ahad spamming`')
    .setTimestamp();
}

module.exports = { execute };
