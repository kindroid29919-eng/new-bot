const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');
const { TIER_EMOJI, TYPE_EMOJI, LEVEL_EMOJI, getType } = require('../utils/battleEngine.js');

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

  const lines = rows.map((c, i) => {
    const type = getType(c.character_id);
    const lvl  = c.level || 1;
    return `**${i + 1}.** ${TIER_EMOJI[c.tier]} ${TYPE_EMOJI[type]} ${LEVEL_EMOJI}**${lvl}** ${c.character_name} — *${c.source_title}*`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle(`💍 ${target.username}'s Harem (${rows.length}/${db.MAX_HAREM_SIZE})`)
    .setDescription(
      lines.join('\n') +
        `\n\nUse \`x!view <number>\` to see a character's details, or \`x!unmarry <number>\` to remove one.`,
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
