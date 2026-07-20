/**
 * diagharem.js — x!diagharem
 * ONE-TIME diagnostic command: dumps your raw harem rows (id, character_id,
 * name, image_url, tier) so we can see exactly what's stored in the DB.
 * Delete after use.
 */

const db = require('../utils/db.js');

async function execute(message) {
  const { rows } = await db.pool.query(
    `SELECT id, character_id, character_name, image_url, tier, married_at
     FROM harem WHERE user_id = $1 ORDER BY id`,
    [message.author.id],
  );

  if (!rows.length) {
    return message.reply('You have no harem rows at all.');
  }

  const lines = rows.map(r =>
    `#${r.id} | char_id=${r.character_id} | ${r.character_name} | tier=${r.tier} | image_url=${r.image_url === null ? 'NULL' : `"${r.image_url}"`}`
  );

  // Discord messages cap at 2000 chars — chunk if needed
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if ((current + line + '\n').length > 1900) {
      chunks.push(current);
      current = '';
    }
    current += line + '\n';
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    await message.reply('```\n' + chunk + '```');
  }
}

module.exports = {
  execute,
  name: 'diagharem',
  description: 'One-time diagnostic dump of your raw harem rows. Delete after use.',
  usage: 'diagharem',
  category: 'Admin',
};
