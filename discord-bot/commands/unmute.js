/**
 * unmute.js — x!unmute
 * Removes the "Muted" role from a member (opposite of x!mute).
 * Requires: Moderate Members permission for the command user, Manage Roles for the bot.
 *
 * Usage: x!unmute <@user> [reason]
 */

const { EmbedBuilder } = require('discord.js');

const MUTED_ROLE_NAME = 'Muted';

async function execute(message, args) {
  // ── Permission check ────────────────────────────────────────────────────────
  if (!message.member.permissions.has('ModerateMembers')) {
    return message.reply({ embeds: [noPermEmbed('You need the **Moderate Members** permission to use this.')] });
  }
  if (!message.guild.members.me.permissions.has('ManageRoles')) {
    return message.reply({ embeds: [noPermEmbed('I need the **Manage Roles** permission to do that.')] });
  }

  // ── Target resolution ───────────────────────────────────────────────────────
  const target = message.mentions.members.first();
  if (!target) {
    return message.reply({ embeds: [usageEmbed()] });
  }

  const mutedRole = message.guild.roles.cache.find((r) => r.name === MUTED_ROLE_NAME);
  if (!mutedRole || !target.roles.cache.has(mutedRole.id)) {
    return message.reply({ embeds: [errorEmbed('That member is not currently muted.')] });
  }

  if (!target.manageable) {
    return message.reply({ embeds: [errorEmbed('I cannot modify that member. They may have a higher role than me.')] });
  }

  const reason = args.slice(1).join(' ') || 'No reason provided.';

  try {
    await target.roles.remove(mutedRole, `${message.author.tag}: ${reason}`);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🔊  Member Unmuted')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Unmuted by', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[unmute]', err);
    await message.reply({ embeds: [errorEmbed('Failed to unmute that member.')] });
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
    .setDescription('**Usage:** `x!unmute <@user> [reason]`\n**Example:** `x!unmute @Ahad calmed down`')
    .setTimestamp();
}

module.exports = {
  execute,
  description: 'Remove the Muted role from a member',
  usage: 'unmute <@user> [reason]',
  category: 'Moderation',
};
