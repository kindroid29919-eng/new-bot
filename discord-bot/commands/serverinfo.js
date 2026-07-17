/**
 * serverinfo.js — x!serverinfo
 * Displays information about the current server.
 *
 * Usage: x!serverinfo
 */

const { EmbedBuilder } = require('discord.js');

async function execute(message) {
  const guild = message.guild;

  // Fetch full guild data (owner, etc.)
  await guild.fetch();

  const owner = await guild.fetchOwner();

  const verificationLevels = ['None', 'Low', 'Medium', 'High', 'Very High'];
  const verificationLevel = verificationLevels[guild.verificationLevel] ?? 'Unknown';

  const createdAt = `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`;
  const createdAgo = `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋  ${guild.name}`)
    .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }) ?? null)
    .addFields(
      { name: '👑 Owner', value: owner.user.tag, inline: true },
      { name: '🆔 Server ID', value: guild.id, inline: true },
      { name: '🌍 Region', value: guild.preferredLocale ?? 'Unknown', inline: true },
      { name: '👥 Members', value: guild.memberCount.toLocaleString(), inline: true },
      { name: '💬 Channels', value: guild.channels.cache.size.toLocaleString(), inline: true },
      { name: '🎭 Roles', value: guild.roles.cache.size.toLocaleString(), inline: true },
      { name: '😀 Emojis', value: guild.emojis.cache.size.toLocaleString(), inline: true },
      { name: '🔒 Verification', value: verificationLevel, inline: true },
      { name: '🚀 Boost Level', value: `Level ${guild.premiumTier}  (${guild.premiumSubscriptionCount} boosts)`, inline: true },
      { name: '📅 Created', value: `${createdAt}\n${createdAgo}` },
    )
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  if (guild.description) {
    embed.setDescription(guild.description);
  }

  await message.reply({ embeds: [embed] });
}

module.exports = { execute };
