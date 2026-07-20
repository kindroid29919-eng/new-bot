const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const tierEmoji = {
  Legendary: '🌟',
  Epic: '💎',
  Rare: '🔥',
  Uncommon: '✨',
  Common: '⚪',
};

async function execute(message, args) {
  const target = message.mentions.users.first() || message.author;
  const rows = await db.getHarem(target.id);

  if (!rows.length) {
    const isSelf = target.id === message.author.id;
    return message.reply(
      isSelf
        ? "💔 You haven't married anyone yet — try `x!waifu` to pull a character!"
        : `💔 **${target.username}** hasn't married anyone yet.`,
    );
  }

  // Group by tier for a readable summary
  const byTier = {};
  for (const row of rows) {
    (byTier[row.tier] ||= []).push(row);
  }

  const order = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
  const lines = [];
  for (const tier of order) {
    const group = byTier[tier];
    if (!group?.length) continue;
    lines.push(`\n**${tierEmoji[tier]} ${tier} (${group.length})**`);
    for (const c of group.slice(0, 10)) {
      lines.push(`• ${c.character_name} — *${c.source_title}*`);
    }
    if (group.length > 10) lines.push(`• …and ${group.length - 10} more`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle(`💍 ${target.username}'s Harem (${rows.length})`)
    .setDescription(lines.join('\n'))
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'harem',
  aliases: ['collection'],
  description: "View your (or someone else's) married character collection.",
  usage: 'harem [@user]',
  category: 'Game',
};
