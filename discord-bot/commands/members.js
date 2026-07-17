/**
 * members.js — x!members
 * Shows the member count breakdown for the server.
 *
 * Usage: x!members
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message) {
  const guild = message.guild;
  await guild.members.fetch();

  const total = guild.memberCount;
  const humans = guild.members.cache.filter(m => !m.user.bot).size;
  const bots = guild.members.cache.filter(m => m.user.bot).size;
  const online = guild.members.cache.filter(
    m => m.presence?.status && m.presence.status !== 'offline',
  ).size;

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`👥  Members — ${guild.name}`)
    .addFields(
      { name: '📊 Total', value: total.toLocaleString(), inline: true },
      { name: '🧑 Humans', value: humans.toLocaleString(), inline: true },
      { name: '🤖 Bots', value: bots.toLocaleString(), inline: true },
      { name: '🟢 Online', value: online > 0 ? online.toLocaleString() : 'N/A (no presence intent)', inline: true },
    )
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { execute };
