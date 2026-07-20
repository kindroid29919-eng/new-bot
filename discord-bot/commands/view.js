const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const tierEmoji = { Legendary: '🌟', Epic: '💎', Rare: '🔥', Uncommon: '✨', Common: '⚪' };
const tierColor = { Legendary: 0xffd700, Epic: 0xa855f7, Rare: 0xff4757, Uncommon: 0x2ed573, Common: 0x95a5a6 };

async function execute(message, args) {
  const index = parseInt(args[0], 10);
  if (!index || index < 1) {
    return message.reply('Usage: `x!view <number>` — check `x!harem` for the numbered list.');
  }

  const rows = await db.getHarem(message.author.id);
  const character = rows[index - 1];
  if (!character) {
    return message.reply(`You don't have a character at #${index}. Check \`x!harem\` for your list.`);
  }

  const embed = new EmbedBuilder()
    .setColor(tierColor[character.tier] || 0xff85c0)
    .setTitle(`${tierEmoji[character.tier]} ${character.character_name}`)
    .setDescription(
      `**From:** ${character.source_title}\n` +
        `**Tier:** ${tierEmoji[character.tier]} ${character.tier}\n` +
        `**Married:** <t:${Math.floor(new Date(character.married_at).getTime() / 1000)}:R>`,
    )
    .setTimestamp();

  if (character.image_url) embed.setImage(character.image_url);

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'view',
  aliases: ['profile'],
  description: 'View the picture and details of a married character.',
  usage: 'view <number>',
  category: 'Game',
};
