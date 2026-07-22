/**
 * duel.js — x!duel @user  /  x!duel bot
 * Challenge another user or a bot to a waifu battle.
 * Full battle logic lives in utils/duelEngine.js.
 */

const duelEngine = require('../utils/duelEngine.js');

async function execute(message, args) {
  // Bot mode
  if (args[0]?.toLowerCase() === 'bot') {
    return duelEngine.startBotDuel(message);
  }

  const opponent = message.mentions.users.first();
  if (!opponent) {
    return message.reply(
      '⚔️ Usage:\n' +
      '`x!duel @user` — challenge someone to a waifu battle!\n' +
      '`x!duel bot`   — fight a bot opponent and earn XP!',
    );
  }

  await duelEngine.startDuel(message, opponent);
}

module.exports = {
  execute,
  name: 'duel',
  aliases: ['battle', 'fight'],
  description: 'Challenge another user or a bot to a turn-based waifu duel.',
  usage: 'duel @user | duel bot',
  category: 'Game',
};
