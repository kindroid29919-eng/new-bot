/**
 * unban.js — x!unban
 * Unbans a previously banned user by ID, or by their username / tag.
 * Requires: Ban Members permission for both the bot and the command user.
 *
 * Usage: x!unban <userID | username> [reason]
 * Example: x!unban 123456789012345678 appeal accepted
 * Example: x!unban Ahad appeal accepted
 *
 * Note: banned users are no longer server members, so they can't be @mentioned —
 * you must supply their ID or username instead.
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

  const query = args[0];
  if (!query) {
    return message.reply({ embeds: [usageEmbed()] });
  }

  const reason = args.slice(1).join(' ') || 'No reason provided.';

  // ── Resolve the banned user ─────────────────────────────────────────────────
  try {
    const bans = await message.guild.bans.fetch();

    let bannedUser;
    if (/^\d{17,20}$/.test(query)) {
      // Looks like a raw user ID
      bannedUser = bans.get(query)?.user;
    } else {
      // Fall back to matching by username or tag (case-insensitive)
      const needle = query.toLowerCase().replace(/^@/, '');
      const match = bans.find(
        (b) => b.user.username.toLowerCase() === needle || b.user.tag.toLowerCase() === needle,
      );
      bannedUser = match?.user;
    }

    if (!bannedUser) {
      return message.reply({ embeds: [errorEmbed(`I couldn't find a ban matching \`${query}\`.`)] });
    }

    await message.guild.members.unban(bannedUser.id, `${message.author.tag}: ${reason}`);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🔓  Member Unbanned')
      .addFields(
        { name: 'User', value: `${bannedUser.tag} (${bannedUser.id})`, inline: true },
        { name: 'Unbanned by', value: message.author.tag, inline: true },
        { name: 'Reason', value: reason },
      )
      .setThumbnail(bannedUser.displayAvatarURL())
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (err) {
    console.error('[unban]', err);
    await message.reply({ embeds: [errorEmbed('Failed to unban that user.')] });
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
      '**Usage:** `x!unban <userID | username> [reason]`\n' +
      '**Example:** `x!unban 123456789012345678 appeal accepted`\n' +
      "*(Banned users can't be @mentioned — use their ID or username.)*",
    )
    .setTimestamp();
}

module.exports = {
  execute,
  description: 'Unban a user by ID or username',
  usage: 'unban <userID | username> [reason]',
  category: 'Moderation',
};
