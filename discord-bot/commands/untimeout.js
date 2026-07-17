/**
 * untimeout.js — x!untimeout
 * Removes an active timeout from a mentioned member (opposite of x!timeout).
 * Requires: Moderate Members permission for both the bot and the command user.
 *
 * Usage: x!untimeout <@user> [reason]
 * Aliases: x!removetimeout
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message, args) {
  // ── Permission check ────────────────────────────────────────────────────────
  if (!message.member.permissions.has('ModerateMembers')) {
    return message.reply({ embeds: [noPermEmbed('You need the **Moderate Members** permission to use this.')] });
  }
  if (!message.guild.members.me.permissions.has('ModerateMembers')) {
    return message.reply({ embeds: [noPermEmbed('I need the **Moderate Members** permission to do that.')] });
  }

  // ── Target resolution ───────────────────────────────────────────────────────
  const target = message.mentions.members.first();
  if (!target) {
    return message.reply({ embeds: [usageEmbed()] });
  }

  if (!target.isCommunicationDisabled || !target.isCommunicationDisabled()) {
    return message.reply({ embeds: [errorEmbed('That member is not currently timed out.')] });
  }

  if (!target.moderatable) {
    return message.reply({ embeds: [errorEmbed('I cannot modify that member. They may have a higher role than me.')] });
  }

  const reason = args.slice(1).join(' ') || 'No reason provided.';

  // ── Execute ─────────────────────────────────────────────────────────────────
  try {
    await target.timeout(null, `${message.author.tag}: ${reason}`);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('⏱️  Timeout Removed')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Removed by', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[untimeout]', err);
    await message.reply({ embeds: [errorEmbed('Failed to remove the timeout from that member.')] });
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
    .setDescription('**Usage:** `x!untimeout <@user> [reason]`\n**Example:** `x!untimeout @Ahad appeal accepted`')
    .setTimestamp();
}

module.exports = { execute };
