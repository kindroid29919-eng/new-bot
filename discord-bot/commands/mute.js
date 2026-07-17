/**
 * mute.js — x!mute
 * Mutes a member indefinitely using a managed "Muted" role, rather than
 * Discord's native timeout (which caps out at 28 days). Useful for mutes
 * that should last until a moderator manually lifts them with x!unmute.
 *
 * The "Muted" role is created automatically the first time it's needed, and
 * gets a deny-override (Send Messages / Add Reactions / Speak) applied to
 * every existing channel so the mute is effective server-wide.
 *
 * Requires: Moderate Members permission for both the bot and the command user,
 * and Manage Roles for the bot (to create/apply the role).
 *
 * Usage: x!mute <@user> [reason]
 * Optional duration is supported too, matching x!timeout's syntax:
 * Usage: x!mute <@user> [duration] [reason]   e.g. x!mute @Ahad 2h spamming
 */

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { parseDuration } = require('../utils/duration');

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

  if (target.id === message.author.id) {
    return message.reply({ embeds: [errorEmbed('You cannot mute yourself.')] });
  }

  if (!target.manageable) {
    return message.reply({ embeds: [errorEmbed('I cannot mute that member. They may have a higher role than me.')] });
  }

  // ── Optional duration (e.g. "2h", "1d") — otherwise mute is indefinite ──────
  let parsed = parseDuration(args[1]);
  let reasonStartIndex = 2;
  if (!parsed && args[1] && args[2]) {
    const combined = parseDuration(`${args[1]} ${args[2]}`);
    if (combined) {
      parsed = combined;
      reasonStartIndex = 3;
    }
  }
  if (!parsed) reasonStartIndex = 1; // no duration found, args[1] onward is the reason

  const reason = args.slice(reasonStartIndex).join(' ') || 'No reason provided.';

  try {
    const mutedRole = await getOrCreateMutedRole(message.guild);

    if (target.roles.cache.has(mutedRole.id)) {
      return message.reply({ embeds: [errorEmbed('That member is already muted.')] });
    }

    await target.roles.add(mutedRole, `${message.author.tag}: ${reason}`);

    // Schedule auto-unmute if a duration was given
    if (parsed) {
      setTimeout(async () => {
        try {
          const refreshed = await message.guild.members.fetch(target.id).catch(() => null);
          if (refreshed?.roles.cache.has(mutedRole.id)) {
            await refreshed.roles.remove(mutedRole, 'Mute duration expired');
          }
        } catch (err) {
          console.error('[mute] auto-unmute failed', err);
        }
      }, parsed.ms);
    }

    const embed = new EmbedBuilder()
      .setColor(0xffa502)
      .setTitle('🔇  Member Muted')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Muted by', value: message.author.tag, inline: true },
        { name: 'Duration', value: parsed ? parsed.text : 'Indefinite (until x!unmute)', inline: true },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[mute]', err);
    await message.reply({ embeds: [errorEmbed('Failed to mute that member.')] });
  }
}

/** Finds the guild's "Muted" role, creating it (with per-channel overwrites) if missing. */
async function getOrCreateMutedRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === MUTED_ROLE_NAME);
  if (role) return role;

  role = await guild.roles.create({
    name: MUTED_ROLE_NAME,
    color: 0x5c5c5c,
    permissions: [],
    reason: 'Auto-created by x!mute for indefinite mutes',
  });

  await Promise.all(
    guild.channels.cache.map(async (channel) => {
      try {
        if (channel.isTextBased?.() || channel.isVoiceBased?.()) {
          await channel.permissionOverwrites.edit(role, {
            SendMessages: false,
            AddReactions: false,
            Speak: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
          });
        }
      } catch (err) {
        console.error(`[mute] failed to set overwrite in #${channel.name}`, err.message);
      }
    }),
  );

  return role;
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
      '**Usage:** `x!mute <@user> [duration] [reason]`\n' +
      '**Example:** `x!mute @Ahad spamming` (indefinite, until `x!unmute`)\n' +
      '**Example:** `x!mute @Ahad 2h spamming` (auto-unmutes after 2 hours)',
    )
    .setTimestamp();
}

module.exports = {
  execute,
  description: 'Mute a member indefinitely (or for a set duration) using the Muted role',
  usage: 'mute <@user> [duration] [reason]',
  category: 'Moderation',
};
