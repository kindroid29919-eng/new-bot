/**
 * help.js — x!help
 * Dynamically builds the command list from the loaded commands map.
 * No manual updates needed — adding a new command file with a `category`
 * export is all that's required.
 */

const { EmbedBuilder } = require('discord.js');
const { prefix } = require('../config/config');

// Category display order and emoji
const CATEGORY_META = {
  Fun:        { emoji: '🚨', order: 0 },
  Moderation: { emoji: '🔨', order: 1 },
  Info:       { emoji: '📊', order: 2 },
};

async function execute(message, _args, commands) {
  // Group commands by category
  const groups = new Map();

  for (const [name, mod] of commands) {
    if (!mod.description) continue; // skip commands with no metadata

    const cat = mod.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push({ name, mod });
  }

  // Sort categories by defined order, then alphabetically
  const sorted = [...groups.entries()].sort(([a], [b]) => {
    const orderA = CATEGORY_META[a]?.order ?? 99;
    const orderB = CATEGORY_META[b]?.order ?? 99;
    return orderA !== orderB ? orderA - orderB : a.localeCompare(b);
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📖  Command List')
    .setDescription(`Prefix: \`${prefix}\`  •  Use \`${prefix}help\` to see this menu anytime.`);

  for (const [cat, entries] of sorted) {
    const emoji = CATEGORY_META[cat]?.emoji ?? '⚙️';

    const lines = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, mod }) => {
        const aliases = mod.aliases?.length ? ` *(also: ${mod.aliases.map(a => `\`${prefix}${a}\``).join(', ')})* ` : '';
        return `\`${prefix}${mod.usage || name}\`${aliases}— ${mod.description}`;
      });

    embed.addFields({ name: `${emoji} ${cat}`, value: lines.join('\n') });
  }

  embed
    .setFooter({ text: `Requested by ${message.author.tag}  •  ${commands.size} commands loaded` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Show all available commands',
  usage: 'help',
  category: 'Info',
};
