/**
 * embedBuilder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Utility functions for building Discord embeds consistently.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { EmbedBuilder } = require('discord.js');
const { embedColors, footerMessages } = require('../config/config');

/**
 * Pick a random item from an array.
 * @param {Array} arr
 * @returns {*} A random element
 */
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build the success embed for the x!expose command.
 *
 * @param {string} target  - The display name or mention to expose
 * @param {string} message - The expose message (with {target} already replaced)
 * @param {string} authorTag - The Discord tag of the user who ran the command
 * @returns {EmbedBuilder}
 */
function buildExposeEmbed(target, message, authorTag) {
  const color = randomFrom(embedColors);
  const footer = randomFrom(footerMessages);

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🚨  E X P O S E D')
    .setDescription(`> ${message}`)
    .addFields({
      name: '🎯 Target',
      value: target,
      inline: true,
    })
    .setFooter({ text: `${footer}  •  Exposed by ${authorTag}` })
    .setTimestamp();
}

/**
 * Build a simple error embed.
 *
 * @param {string} description - The error message to display
 * @returns {EmbedBuilder}
 */
function buildErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor(0xff4757)
    .setTitle('❌  Oops!')
    .setDescription(description)
    .setFooter({ text: 'Usage: x!expose <name> or x!expose @user' })
    .setTimestamp();
}

module.exports = { buildExposeEmbed, buildErrorEmbed, randomFrom };
