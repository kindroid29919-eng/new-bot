/**
 * myview.js — x!myview (alias: x!mv)
 * Shows the command user's "view" on another person or name.
 * Format: "{author} thinks {target} is [random opinion]"
 *
 * Usage: x!myview <name | @user>
 *        x!mv     <name | @user>
 */

const { EmbedBuilder } = require('discord.js');
const { randomFrom }   = require('../utils/embedBuilder');
const views            = require('../data/myviews');
const { embedColors }  = require('../config/config');

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Invalid Usage')
          .setDescription('**Usage:** `x!myview <name | @user>`\n**Example:** `x!myview @Ahad`')
          .setTimestamp(),
      ],
    });
  }

  // Resolve target
  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');

  // Author display name (use guild nick if available)
  const author = message.member?.displayName ?? message.author.username;

  const template = randomFrom(views);
  const text     = template
    .replace(/{author}/g, author)
    .replace(/{target}/g, target);

  const color = randomFrom(embedColors);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('🧠  My View')
    .setDescription(`> ${text}`)
    .setFooter({ text: `${author}'s honest opinion • x!myview` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: "Share the command user's personal view on someone",
  usage: 'myview <name | @user>',
  category: 'Fun',
  aliases: ['mv'],
};
