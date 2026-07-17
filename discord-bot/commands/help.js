/**
 * help.js — x!help
 * Lists all available commands with usage examples.
 */

const { EmbedBuilder } = require('discord.js');
const { prefix } = require('../config/config');

async function execute(message) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📖  Command List')
    .setDescription(`Prefix: \`${prefix}\`  •  Use \`${prefix}help\` to see this menu anytime.`)
    .addFields(
      {
        name: '🚨 Fun',
        value: [
          `\`${prefix}expose <name/@user>\` — Expose someone with a random roast`,
        ].join('\n'),
      },
      {
        name: '🔨 Moderation',
        value: [
          `\`${prefix}ban <@user> [reason]\` — Ban a member`,
          `\`${prefix}unban <userID/username> [reason]\` — Unban a member`,
          `\`${prefix}kick <@user> [reason]\` — Kick a member`,
          `\`${prefix}timeout <@user> <duration> [reason]\` — Timeout a member (e.g. \`10m\`, \`2h\`, \`1d\`, \`1w\`)`,
          `\`${prefix}untimeout <@user> [reason]\` — Remove a member's timeout`,
          `\`${prefix}mute <@user> [duration] [reason]\` — Mute a member indefinitely (or for a duration)`,
          `\`${prefix}unmute <@user> [reason]\` — Unmute a member`,
          `\`${prefix}purge <count>\` — Bulk delete recent messages`,
          `\`${prefix}nuke\` — Wipe the entire channel (confirmation required)`,
        ].join('\n'),
      },
      {
        name: '🎭 Roles',
        value: [
          `\`${prefix}role add <@user> <role>\` — Give a member a role`,
          `\`${prefix}role remove <@user> <role>\` — Take a role from a member`,
          `\`${prefix}role create <name> [hexColor]\` — Create a new role`,
          `\`${prefix}role delete <role>\` — Delete a role`,
          `\`${prefix}role all <role>\` — Add a role to every member`,
          `\`${prefix}role removeall <role>\` — Remove a role from every member`,
          `\`${prefix}role bots <role>\` — Add a role to every bot`,
          `\`${prefix}role commands\` — Show role subcommand help`,
        ].join('\n'),
      },
      {
        name: '📊 Server Info',
        value: [
          `\`${prefix}serverinfo\` — Show server details`,
          `\`${prefix}members\` — Show member count`,
        ].join('\n'),
      },
    )
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute };
