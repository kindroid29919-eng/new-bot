/**
 * timeout.js — x!timeout
 * Times out (mutes) a mentioned member for a specified number of minutes.
 * Requires: Moderate Members permission for both the bot and the command user.
 *
 * Usage: x!timeout <@user> <minutes> [reason]
 */

const { EmbedBuilder } = require('discord.js');

const MAX_MINUTES = 40320; // Discord's max timeout: 28 days

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

  const minutes = parseInt(args[1], 10);
  if (!minutes || minutes <= 0 || minutes > MAX_MINUTES) {
    return message.reply({
      embeds: [errorEmbed(`Please provide a valid duration between **1** and **${MAX_MINUTES.toLocaleString()}** minutes (28 days max).`)],
    });
  }

  if (target.id === message.author.id) {
    return message.reply({ embeds: [errorEmbed('You cannot timeout yourself.')] });
  }

  if (!target.moderatable) {
    return message.reply({ embeds: [errorEmbed('I cannot timeout that member. They may have a higher role than me.')] });
  }

  const reason = args.slice(2).join(' ') || 'No reason provided.';
  const durationMs = minutes * 60 * 1000;

  // ── Execute ─────────────────────────────────────────────────────────────────
  try {
    await target.timeout(durationMs, `${message.author.tag}: ${reason}`);

    // Human-readable duration
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const durationText = hours > 0
      ? `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim()
      : `${mins}m`;

    const embed = new EmbedBuilder()
      .setColor(0xffd32a)
      .setTitle('⏱️  Member Timed Out')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Timed out by', value: message.author.tag, inline: true },
        { name: 'Duration', value: durationText, inline: true },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[timeout]', err);
    await message.reply({ embeds: [errorEmbed('Failed to timeout that member.')] });
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
    .setDescription('**Usage:** `x!timeout <@user> <minutes> [reason]`\n**Example:** `x!timeout @Ahad 10 spamming`')
    .setTimestamp();
}

module.exports = { execute };
