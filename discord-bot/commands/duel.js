/**
 * duel.js — x!duel @user
 * Challenge another user to a waifu battle.
 * Full battle logic lives in utils/duelEngine.js.
 */

const duelEngine = require('../utils/duelEngine.js');

async function execute(message, args) {
  const opponent = message.mentions.users.first();
  if (!opponent) {
    return message.reply(
      '⚔️ Usage: `x!duel @user`\n' +
      'Challenge someone to a waifu battle! Both players pick a fighter from their harem, then duke it out turn-by-turn.',
    );
  }

  await duelEngine.startDuel(message, opponent);
}

module.exports = {
  execute,
  name: 'duel',
  aliases: ['battle', 'fight'],
  description: 'Challenge another user to a turn-based waifu duel.',
  usage: 'duel @user',
  category: 'Game',
};
