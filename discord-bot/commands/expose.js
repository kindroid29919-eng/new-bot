/**
 * expose.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The x!expose command handler.
 *
 * Usage:
 *   x!expose <name>   — exposes a name (e.g. x!expose Ahad)
 *   x!expose @user    — exposes a Discord mention (e.g. x!expose @Ahad)
 *
 * The command is case-insensitive (x!Expose, x!EXPOSE, x!eXpOsE all work).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const exposes = require('../data/exposes');
const { buildExposeEmbed, buildErrorEmbed, randomFrom } = require('../utils/embedBuilder');

/**
 * Execute the expose command.
 *
 * @param {import('discord.js').Message} message - The Discord message object
 * @param {string[]} args - Arguments supplied after the command name
 */
async function execute(message, args) {
  // ── Guard: no argument provided ──────────────────────────────────────────
  if (!args.length) {
    const errorEmbed = buildErrorEmbed(
      '❌ Please provide a person to expose.\n\n**Examples:**\n`x!expose Ahad`\n`x!expose @Ahad`',
    );
    return message.reply({ embeds: [errorEmbed] });
  }

  // ── Resolve target ────────────────────────────────────────────────────────
  let target;
  const firstArg = args[0];

  // Check if the argument is a user mention (<@12345> or <@!12345>)
  const mentionMatch = firstArg.match(/^<@!?(\d+)>$/);

  if (mentionMatch) {
    // It's a mention — use the mention string directly so Discord renders it
    target = firstArg;
  } else {
    // It's a plain text name — join all args in case the name has spaces
    // e.g. x!expose John Doe
    target = args.join(' ');
  }

  // ── Pick a random expose message and replace the placeholder ─────────────
  const template = randomFrom(exposes);
  const finalMessage = template.replace(/{target}/g, target);

  // ── Build and send the embed ──────────────────────────────────────────────
  const embed = buildExposeEmbed(target, finalMessage, message.author.tag);

  try {
    await message.reply({ embeds: [embed] });
  } catch (err) {
    // If the reply fails (e.g. missing permissions), log it gracefully
    console.error(`[expose] Failed to send embed in ${message.guild?.name}:`, err.message);
  }
}

module.exports = {
  execute,
  description: 'Expose someone with a random roast',
  usage: 'expose <name | @user>',
  category: 'Fun',
};
