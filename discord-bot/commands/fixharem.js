/**
 * fixharem.js — x!fixharem
 * ONE-TIME repair command: backfills image_url on your own existing harem
 * rows for Kurumi Tokisaki / Mahiru Shiina, in case they were purchased
 * before the image mapping was correct.
 *
 * Usage: x!fixharem
 * After you've run it once and confirmed the images show up in x!view,
 * delete this file — it's not meant to be a permanent command.
 */

const db = require('../utils/db.js');

// Must match the imageUrl values in shop.js's SHOP_ITEMS
const FIXES = [
  {
    characterId: 70069,
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b70069-DEV7X6o2L7oG.jpg',
  },
  {
    characterId: 195602,
    imageUrl: 'https://s4.anilist.co/file/anilistcdn/character/large/b195602-Cc0vrUDl7r15.png',
  },
];

async function execute(message) {
  let totalFixed = 0;
  const details = [];

  for (const fix of FIXES) {
    const { rowCount } = await db.pool.query(
      `UPDATE harem
         SET image_url = $1
       WHERE user_id = $2
         AND character_id = $3
         AND (image_url IS NULL OR image_url = '')`,
      [fix.imageUrl, message.author.id, fix.characterId],
    );
    totalFixed += rowCount;
    details.push(`character_id ${fix.characterId}: ${rowCount} row(s) updated`);
  }

  await message.reply(
    totalFixed > 0
      ? `✅ Fixed **${totalFixed}** row(s) for your account.\n` + details.join('\n') +
        `\n\nCheck \`x!harem\` and \`x!view\` — images should show now. You can delete fixharem.js after confirming.`
      : `Nothing to fix — either your rows already had an image_url, or you don't own these characters.\n` + details.join('\n'),
  );
}

module.exports = {
  execute,
  name: 'fixharem',
  description: 'One-time repair for missing shop character images. Delete after use.',
  usage: 'fixharem',
  category: 'Admin',
};
