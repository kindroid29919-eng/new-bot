// x!warfare @user — 3v3 gauntlet (thin wrapper around warfareEngine)
const warfareEngine = require('../utils/warfareEngine.js');
const duelEngine    = require('../utils/duelEngine.js');

async function execute(message) {
  const opponent = message.mentions.users.first();
  if (!opponent) return message.reply('Usage: `x!warfare @user` — challenge someone to a 3v3 waifu gauntlet!');

  // Prevent starting warfare if either player is in a duel
  if (duelEngine.isUserInDuel(message.author.id)) {
    return message.reply("⚔️ Finish your current duel before starting a warfare.");
  }
  if (duelEngine.isUserInDuel(opponent.id)) {
    return message.reply(`⚔️ **${opponent.username}** is in a duel right now.`);
  }

  await warfareEngine.startWarfare(message, opponent);
}

module.exports = {
  execute,
  name: 'warfare',
  aliases: ['war', 'teamduel'],
  description: '3v3 waifu gauntlet — pick a team of 3, choose a stance, auto-battle!',
  usage: 'warfare @user',
  category: 'Game',
};
