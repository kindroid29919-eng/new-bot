/**
 * vote.js — x!vote
 * Show the top.gg vote link and how many Petals users earn for voting.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');
const { prefix } = require('../config/config');

async function execute(message) {
  const clientId = message.client.user.id;
  const avatar = message.client.user.avatar;
  const avatarUrl = avatar
    ? `https://cdn.discordapp.com/avatars/${clientId}/${avatar}.png?size=256`
    : null;

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle('🗳️ Vote for Xoul on top.gg')
    .setDescription(
      `Vote every **${db.VOTE_COOLDOWN_HOURS} hours** to earn **${db.VOTE_REWARD} 🌸 Petals**!\n\n` +
      `👉 [Click here to vote](https://top.gg/bot/${clientId}/vote)\n\n` +
      `After voting, run \`${prefix}voteclaim\` to collect your reward.`,
    )
    .setTimestamp();
  if (avatarUrl) embed.setThumbnail(avatarUrl);

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'vote',
  aliases: [],
  description: 'Get the top.gg vote link and reward info for Xoul.',
  usage: 'vote',
  category: 'Economy',
};
