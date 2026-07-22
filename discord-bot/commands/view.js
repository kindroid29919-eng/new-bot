const { EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const db   = require('../utils/db.js');

const tierEmoji = { Legendary: '🌟', Epic: '💎', Rare: '🔥', Uncommon: '✨', Common: '⚪' };
const tierColor = { Legendary: 0xffd700, Epic: 0xa855f7, Rare: 0xff4757, Uncommon: 0x2ed573, Common: 0x95a5a6 };

// ── Local pool image fallback ──────────────────────────────────────────────────
// Characters promoted to Legendary via legendary-local.json were originally
// stored in the harem DB with a blank image_url (before the image fields were
// populated). This lookup repairs that on first view: if the DB record has no
// image, we search the local pool by name and, if found, write the URL back so
// every subsequent view is served straight from the DB.

let _localPoolById   = null;
let _localPoolByName = null;

function loadLocalPool() {
  if (_localPoolById) return;
  try {
    const raw     = fs.readFileSync(path.join(__dirname, '..', 'data', 'legendary-local.json'), 'utf8');
    const entries = JSON.parse(raw);
    _localPoolById   = new Map(entries.map(e => [e.id,                   e.image]));
    _localPoolByName = new Map(entries.map(e => [e.name.toLowerCase(),   e.image]));
  } catch {
    _localPoolById   = new Map();
    _localPoolByName = new Map();
  }
}

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

  let imageUrl = character.image_url || '';

  // Self-healing fallback: if the DB record has no image, check the local
  // legendary pool by name and patch the DB record so future views are instant.
  if (!imageUrl) {
    const poolImage = localPoolByName().get(character.character_name.toLowerCase());
    if (poolImage) {
      imageUrl = poolImage;
      db.updateHaremImage(message.author.id, character.character_id, imageUrl).catch(() => {});
    }
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

  if (imageUrl) embed.setImage(imageUrl);

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
