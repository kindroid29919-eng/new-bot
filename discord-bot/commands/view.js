const { EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const db   = require('../utils/db.js');
const {
  TIER_EMOJI, TYPE_EMOJI, LEVEL_EMOJI, LEVELUP_EMOJI,
  getType, getLevelStats, xpToNextLevel, MAX_LEVEL,
} = require('../utils/battleEngine.js');

const tierColor = { Legendary: 0xffd700, Epic: 0xa855f7, Rare: 0xff4757, Uncommon: 0x2ed573, Common: 0x95a5a6 };

// ── Local pool image fallback ──────────────────────────────────────────────────
let _localPoolById   = null;
let _localPoolByName = null;

function loadLocalPool() {
  if (_localPoolById) return;
  try {
    const raw     = fs.readFileSync(path.join(__dirname, '..', 'data', 'legendary-local.json'), 'utf8');
    const entries = JSON.parse(raw);
    _localPoolById   = new Map(entries.map(e => [e.id,                 e.image]));
    _localPoolByName = new Map(entries.map(e => [e.name.toLowerCase(), e.image]));
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

  if (!imageUrl) {
    loadLocalPool();
    const poolImage = _localPoolByName.get(character.character_name.toLowerCase());
    if (poolImage) {
      imageUrl = poolImage;
      db.updateHaremImage(message.author.id, character.character_id, imageUrl).catch(() => {});
    }
  }

  const type  = getType(character.character_id);
  const level = character.level || 1;
  const xp    = character.xp    || 0;
  const stats = getLevelStats(character.tier, level);
  const xpNeeded = level < MAX_LEVEL ? xpToNextLevel(level) : 0;

  const levelLine = level < MAX_LEVEL
    ? `${LEVEL_EMOJI} **Level ${level}** — ${xp}/${xpNeeded} XP to next level`
    : `${LEVEL_EMOJI} **Level ${level}** ${LEVELUP_EMOJI} *(MAX)*`;

  const embed = new EmbedBuilder()
    .setColor(tierColor[character.tier] || 0xff85c0)
    .setTitle(`${TIER_EMOJI[character.tier]} ${character.character_name}`)
    .setDescription(
      `**From:** ${character.source_title}\n` +
      `**Tier:** ${TIER_EMOJI[character.tier]} ${character.tier}\n` +
      `**Element:** ${TYPE_EMOJI[type]} ${type}\n` +
      `${levelLine}\n\n` +
      `❤️ **HP:** ${stats.hp}　⚔️ **ATK:** ${stats.atk}　🛡️ **DEF:** ${stats.def}\n` +
      `✨ **Special:** ${stats.specialMult.toFixed(2)}x　⚡ **Energy needed:** ${stats.specialThreshold}\n\n` +
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
  description: 'View the picture, level, and stats of a married character.',
  usage: 'view <number>',
  category: 'Game',
};
