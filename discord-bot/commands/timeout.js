/**
 * timeout.js — x!timeout
 * Times out (mutes) a mentioned member using Discord's native timeout.
 * Requires: Moderate Members permission for both the bot and the command user.
 *
 * Usage: x!timeout <@user> <duration> [reason]
 * Duration understands:
 *   - A bare number         → minutes, e.g. `10`
 *   - Shorthand units       → `10m`, `2h`, `1d`, `1w`
 *   - Full words            → `10 minutes`, `2 hours`, `1 day`, `1 week`
 *   - Combined shorthand    → `1d12h`, `2h30m`
 *
 * Examples:
 *   x!timeout @Ahad 10          → 10 minutes
 *   x!timeout @Ahad 2h spamming → 2 hours
 *   x!timeout @Ahad 1d          → 1 day
 *   x!timeout @Ahad 1w          → 1 week (Discord's max)
 */

const { EmbedBuilder } = require('discord.js');
const { parseDuration } = require('../utils/duration');

const MAX_MS = 28 * 24 * 60 * 60 * 1000; // Discord's hard cap: 28 days

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

  // ── Duration parsing (smart: minutes, "10m", "2h", "1d", "1w", full words, combos) ──
  let parsed = parseDuration(args[1]);
  let reasonStartIndex = 2;

  // Allow a two-token duration like "2 hours" (args[1] = "2", args[2] = "hours")
  if (!parsed && args[1] && args[2]) {
    const combined = parseDuration(`${args[1]} ${args[2]}`);
    if (combined) {
      parsed = combined;
      reasonStartIndex = 3;
    }
  }

  if (!parsed) {
    return message.reply({
      embeds: [errorEmbed('Please provide a valid duration, e.g. `10`, `10m`, `2h`, `1d`, `1w`, or `2 hours`.')],
    });
  }

  if (parsed.ms > MAX_MS) {
    return message.reply({ embeds: [errorEmbed('Duration is too long. Discord allows a maximum timeout of **28 days**.')] });
  }

  if (target.id === message.author.id) {
    return message.reply({ embeds: [errorEmbed('You cannot timeout yourself.')] });
  }

  if (!target.moderatable) {
    return message.reply({ embeds: [errorEmbed('I cannot timeout that member. They may have a higher role than me.')] });
  }

  const reason = args.slice(reasonStartIndex).join(' ') || 'No reason provided.';

  // ── Execute ─────────────────────────────────────────────────────────────────
  try {
    await target.timeout(parsed.ms, `${message.author.tag}: ${reason}`);

    const embed = new EmbedBuilder()
      .setColor(0xffd32a)
      .setTitle('⏱️  Member Timed Out')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Timed out by', value: message.author.tag, inline: true },
        { name: 'Duration', value: parsed.text, inline: true },
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
    .setDescription(
      '**Usage:** `x!timeout <@user> <duration> [reason]`\n' +
      '**Duration examples:** `10`, `10m`, `2h`, `1d`, `1w`, `1d12h`, `2 hours`\n' +
      '**Example:** `x!timeout @Ahad 2h spamming`',
    )
    .setTimestamp();
}

module.exports = { execute };
