/**
 * help.js — x!help
 * Dynamically builds an interactive, button-based help menu.
 * No manual updates needed — handles category scaling automatically.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { prefix } = require('../config/config');

// Category metadata: Defines display names, emojis, styles, and order priority
const CATEGORY_META = {
  Social:     { emoji: '💬', label: 'Social', style: ButtonStyle.Primary, order: 0 },
  Fun:        { emoji: '🚨', label: 'Fun', style: ButtonStyle.Primary, order: 1 },
  Moderation: { emoji: '🔨', label: 'Moderation', style: ButtonStyle.Primary, order: 2 },
  Info:       { emoji: '📊', label: 'Info', style: ButtonStyle.Primary, order: 3 },
  Other:      { emoji: '⚙️', label: 'Other', style: ButtonStyle.Secondary, order: 4 },
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

  // Sort categories by defined meta order, then alphabetically
  const sortedCategories = [...groups.keys()].sort((a, b) => {
    const orderA = CATEGORY_META[a]?.order ?? 99;
    const orderB = CATEGORY_META[b]?.order ?? 99;
    return orderA !== orderB ? orderA - orderB : a.localeCompare(b);
  });

  // 1. Build the Professional Landing (Home) Page Embed
  const homeEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📖  Help Center')
    .setDescription(
      `Welcome to the command dashboard! Click the interactive buttons below to browse through my commands by category.\n\n` +
      `• **Prefix:** \`${prefix}\`\n` +
      `• **Usage:** \`${prefix}help\` to open this menu.`
    )
    .addFields({
      name: '⚡  System Matrix',
      value: `📁 Total Categories: **${groups.size}**\n⚙️ Total Commands: **${commands.size}**`,
      inline: false,
    })
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  // 2. Component Generator (Handles button row partitioning automatically)
  const generateComponents = (disabled = false) => {
    const rows = [];
    let currentRow = new ActionRowBuilder();

    // Always append the Home button first
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId('help_home')
        .setLabel('Home')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    );

    // Append dynamic category pages
    for (const cat of sortedCategories) {
      // Discord layout constraints restrict us to a max of 5 buttons per row
      if (currentRow.components.length === 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }

      const meta = CATEGORY_META[cat] || { emoji: '⚙️', label: cat, style: ButtonStyle.Primary };
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`help_cat_${cat.toLowerCase()}`)
          .setLabel(meta.label)
          .setEmoji(meta.emoji)
          .setStyle(meta.style)
          .setDisabled(disabled)
      );
    }

    if (currentRow.components.length > 0) rows.push(currentRow);
    return rows;
  };

  // 3. Helper utility to compile specific category pages
  const buildCategoryEmbed = (catName) => {
    const entries = groups.get(catName) || [];
    const meta = CATEGORY_META[catName] || { emoji: '⚙️' };

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${meta.emoji}  ${catName} Menu`)
      .setFooter({ text: `Requested by ${message.author.tag}  •  ${entries.length} commands` })
      .setTimestamp();

    if (!entries.length) {
      embed.setDescription('*No commands available in this module.*');
      return embed;
    }

    const lines = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, mod }) => {
        const aliases = mod.aliases?.length ? ` *(aliases: ${mod.aliases.map(a => `\`${a}\``).join(', ')})*` : '';
        return `\`${prefix}${mod.usage || name}\`${aliases}\n└ ${mod.description}`;
      });

    embed.setDescription(`Here are all active commands within **${catName}**:\n\n${lines.join('\n\n')}`);
    return embed;
  };

  // Send the initial menu frame
  const response = await message.reply({
    embeds: [homeEmbed],
    components: generateComponents(false),
  });

  // 4. Set up an efficient Message Component Collector (60s timer)
  const collector = response.createMessageComponentCollector({
    filter: (i) => i.user.id === message.author.id, // Lock controls to command executor
    time: 60000,
  });

  collector.on('collect', async (interaction) => {
    await interaction.deferUpdate();

    if (interaction.customId === 'help_home') {
      return await response.edit({
        embeds: [homeEmbed],
        components: generateComponents(false),
      });
    }

    if (interaction.customId.startsWith('help_cat_')) {
      const selectedLower = interaction.customId.replace('help_cat_', '');
      const matchedCategory = sortedCategories.find((k) => k.toLowerCase() === selectedLower);

      if (matchedCategory) {
        const categoryEmbed = buildCategoryEmbed(matchedCategory);
        return await response.edit({
          embeds: [categoryEmbed],
          components: generateComponents(false),
        });
      }
    }
  });

  // Safely clean up buttons on timeout to prevent lingering dead components
  collector.on('end', async () => {
    await response.edit({ components: generateComponents(true) }).catch(() => {});
  });
}

module.exports = {
  execute,
  description: 'View the active directory of systems and commands.',
  usage: 'help',
  category: 'Info',
};
