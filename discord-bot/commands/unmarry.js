/**
 * unmarry.js — x!unmarry <number>
 * Remove a character from your harem and receive a Petal refund based on their tier.
 *
 * Refund table:
 *   Common    →  10 🌸
 *   Uncommon  →  20 🌸
 *   Rare      →  35 🌸
 *   Epic      →  60 🌸
 *   Legendary → 100 🌸
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');
const { TIER_EMOJI } = require('../utils/battleEngine.js');

const TIER_REFUND = {
  Legendary: 100,
  Epic:       60,
  Rare:       35,
  Uncommon:   20,
  Common:     10,
};


async function execute(message, args) {
  const index = parseInt(args[0], 10);
  if (!index || index < 1) {
    return message.reply('Usage: `x!unmarry <number>` — check `x!harem` for the numbered list.');
  }

  const rows = await db.getHarem(message.author.id);
  const character = rows[index - 1];

  if (!character) {
    return message.reply(
      `You don't have a character at **#${index}**. Check \`x!harem\` for your list (${rows.length} characters).`,
    );
  }

  const refund = TIER_REFUND[character.tier] ?? 10;
  await Promise.all([
    db.removeFromHarem(message.author.id, character.id),
    db.addBalance(message.author.id, refund),
  ]);

  const newBal = await db.getBalance(message.author.id);

  const embed = new EmbedBuilder()
    .setColor(0x636e72)
    .setTitle('💔 Farewell…')
    .setDescription(
      `You said goodbye to **${TIER_EMOJI[character.tier]} ${character.character_name}**.\n\n` +
      `They're free to be pulled by anyone again.\n\n` +
      `🌸 Refund: **+${refund} Petals** (${character.tier} tier)\n` +
      `💰 Balance: **${newBal.toLocaleString()} Petals**`,
    )
    .setFooter({ text: `Harem: ${rows.length - 1}/${db.MAX_HAREM_SIZE}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'unmarry',
  aliases: ['divorce'],
  description: 'Remove a character from your harem and receive a Petal refund based on their tier.',
  usage: 'unmarry <number>',
  category: 'Game',
};
