const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const tierEmoji = { Legendary: '🌟', Epic: '💎', Rare: '🔥', Uncommon: '✨', Common: '⚪' };

async function execute(message) {
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

  const lines = rows.map((c, i) => `**${i + 1}.** ${tierEmoji[c.tier]} ${c.character_name} — *${c.source_title}*`);

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle(`💍 ${target.username}'s Harem (${rows.length}/${db.MAX_HAREM_SIZE})`)
    .setDescription(
      lines.join('\n') +
        `\n\nUse \`x!view <number>\` to see a character's picture, or \`x!unmarry <number>\` to remove one.`,
    )
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
