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
          `\`${prefix}kick <@user> [reason]\` — Kick a member`,
          `\`${prefix}timeout <@user> <minutes> [reason]\` — Timeout a member`,
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
