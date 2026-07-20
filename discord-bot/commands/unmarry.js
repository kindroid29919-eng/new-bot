const db = require('../utils/db.js');

async function execute(message, args) {
  const index = parseInt(args[0], 10);
  if (!index || index < 1) {
    return message.reply('Usage: `x!unmarry <number>` — check `x!harem` for the numbered list.');
  }

  const rows = await db.getHarem(message.author.id);
  const character = rows[index - 1];
  if (!character) {
    return message.reply(`You don't have a character at #${index}. Check \`x!harem\` for your list.`);
  }

  await db.removeFromHarem(message.author.id, character.id);
  await message.reply(`💔 You unmarried **${character.character_name}**. They're free to be pulled by anyone again.`);
}

module.exports = {
  execute,
  name: 'unmarry',
  aliases: ['divorce'],
  description: 'Remove a character from your harem to make room for a new one.',
  usage: 'unmarry <number>',
  category: 'Game',
};
