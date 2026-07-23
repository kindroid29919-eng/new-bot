/**
 * voteclaim.js — x!voteclaim
 * Claim Petals earned by voting for Xoul on top.gg.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

async function execute(message) {
  const result = await db.claimVoteReward(message.author.id);
  const clientId = message.client.user.id;
  const embed = new EmbedBuilder();

  if (result.error === 'no_vote') {
    embed
      .setColor(0xff4757)
      .setTitle('🗳️ No vote found')
      .setDescription(
        `No recent vote found. [Vote for Xoul](https://top.gg/bot/${clientId}/vote) and then claim your reward!`,
      );
  } else if (result.error === 'cooldown') {
    embed
      .setColor(0xff4757)
      .setTitle('⏳ Already claimed')
      .setDescription(`You already claimed your vote reward. Come back in **${result.hoursLeft} hours**.`);
  } else {
    const balance = await db.getBalance(message.author.id);
    embed
      .setColor(0xff85c0)
      .setTitle('🌸 Vote Reward Claimed!')
      .setDescription(
        `You received **${result.reward} 🌸 Petals**!\n\n` +
        `💰 **Balance:** ${balance.toLocaleString()} Petals`,
      );
  }

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'voteclaim',
  aliases: ['claimvote'],
  description: 'Claim your Petal reward for voting on top.gg.',
  usage: 'voteclaim',
  category: 'Economy',
};
