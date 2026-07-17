/**
 * purge.js — x!purge
 * Bulk-deletes a given number of recent messages from the current channel.
 * No confirmation required (fast, everyday moderation tool — see x!nuke for
 * the confirmation-gated "delete everything" version).
 *
 * Requires: Manage Messages permission for both the bot and the command user.
 *
 * Usage: x!purge <count>
 * Example: x!purge 50
 *
 * Notes:
 *   - Discord's bulkDelete only works on messages younger than 14 days; any
 *     older messages in range are skipped automatically (a note is added).
 *   - Max 1000 messages per invocation to avoid runaway rate-limit hits.
 */

const { EmbedBuilder } = require('discord.js');

const MAX_PURGE = 1000;

async function execute(message, args) {
  // ── Permission check ────────────────────────────────────────────────────────
  if (!message.member.permissions.has('ManageMessages')) {
    return message.reply({ embeds: [noPermEmbed('You need the **Manage Messages** permission to use this.')] });
  }
  if (!message.guild.members.me.permissions.has('ManageMessages')) {
    return message.reply({ embeds: [noPermEmbed('I need the **Manage Messages** permission to do that.')] });
  }

  const count = parseInt(args[0], 10);
  if (!count || count <= 0) {
    return message.reply({ embeds: [usageEmbed()] });
  }
  if (count > MAX_PURGE) {
    return message.reply({ embeds: [errorEmbed(`Please choose a number between **1** and **${MAX_PURGE}**.`)] });
  }

  try {
    // Delete the command message itself first so it doesn't count against the total.
    await message.delete().catch(() => {});

    let remaining = count;
    let deletedTotal = 0;
    let hitAgeLimit = false;

    while (remaining > 0) {
      const batchSize = Math.min(remaining, 100);
      const deleted = await message.channel.bulkDelete(batchSize, true); // true = filter out messages > 14 days old
      deletedTotal += deleted.size;
      remaining -= batchSize;

      if (deleted.size < batchSize) {
        hitAgeLimit = true;
        break; // nothing more purgeable (either channel is empty, or the rest are too old)
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🧹  Messages Purged')
      .setDescription(
        `Deleted **${deletedTotal}** message${deletedTotal === 1 ? '' : 's'} in ${message.channel}.` +
        (hitAgeLimit ? '\n*(Stopped early — remaining messages are older than 14 days and can\'t be bulk-deleted.)*' : ''),
      )
      .setFooter({ text: `Requested by ${message.author.tag}` })
      .setTimestamp();

    const confirmation = await message.channel.send({ embeds: [embed] });
    setTimeout(() => confirmation.delete().catch(() => {}), 5000);
  } catch (err) {
    console.error('[purge]', err);
    await message.channel.send({ embeds: [errorEmbed('Failed to purge messages in this channel.')] });
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
    .setDescription(`**Usage:** \`x!purge <count>\`\n**Example:** \`x!purge 50\`\n**Max:** ${MAX_PURGE} at a time`)
    .setTimestamp();
}

module.exports = { execute };
