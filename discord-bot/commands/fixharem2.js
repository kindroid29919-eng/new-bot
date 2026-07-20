/**
 * fixharem2.js — x!fixharem2
 * ONE-TIME repair: your x!waifu pull matched duplicate AniList character
 * entries (45748, 192342) that have no image uploaded on AniList itself.
 * This points your existing rows at the canonical entries' images instead.
 * Delete after use.
 */

const db = require('../utils/db.js');

const FIXES = [
  { characterId: 45748,  imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b70069-DEV7X6o2L7oG.jpg' },  // Tokisaki Kurumi (dup entry) -> canonical 70069
  { characterId: 192342, imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b195602-Cc0vrUDl7r15.png' }, // Mahiru Shiina (dup entry) -> canonical 195602
];

async function execute(message) {
  let totalFixed = 0;
  const details = [];

  for (const fix of FIXES) {
    const { rowCount } = await db.pool.query(
      `UPDATE harem
         SET image_url = $1
       WHERE user_id = $2
         AND character_id = $3`,
      [fix.imageUrl, message.author.id, fix.characterId],
    );
    totalFixed += rowCount;
    details.push(`character_id ${fix.characterId}: ${rowCount} row(s) updated`);
  }

  await message.reply(
    totalFixed > 0
      ? `✅ Fixed **${totalFixed}** row(s).\n` + details.join('\n') +
        `\n\nCheck \`x!view\` — images should show now. Delete fixharem2.js after confirming.`
      : `Nothing matched your account for those character_ids.\n` + details.join('\n'),
  );
}

module.exports = {
  execute,
  name: 'fixharem2',
  description: 'One-time repair for imageless duplicate AniList entries. Delete after use.',
  usage: 'fixharem2',
  category: 'Admin',
};
