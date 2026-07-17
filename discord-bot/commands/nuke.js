/**
 * nuke.js — x!nuke
 * Completely wipes the current channel by cloning it (same name, topic,
 * permissions, and position) and deleting the original — the only reliable
 * way to clear a channel's entire history instantly, since bulkDelete can't
 * touch messages older than 14 days.
 *
 * Requires: Manage Channels permission for both the bot and the command user.
 * Destructive & irreversible — requires an explicit button confirmation.
 *
 * Usage: x!nuke
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const CONFIRM_TIMEOUT_MS = 15_000;

async function execute(message) {
  // ── Permission check ────────────────────────────────────────────────────────
  if (!message.member.permissions.has('ManageChannels')) {
    return message.reply({ embeds: [noPermEmbed('You need the **Manage Channels** permission to use this.')] });
  }
  if (!message.guild.members.me.permissions.has('ManageChannels')) {
    return message.reply({ embeds: [noPermEmbed('I need the **Manage Channels** permission to do that.')] });
  }

  const channel = message.channel;

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('nuke_confirm').setLabel('Nuke this channel').setStyle(ButtonStyle.Danger).setEmoji('💣'),
    new ButtonBuilder().setCustomId('nuke_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  const warningEmbed = new EmbedBuilder()
    .setColor(0xff4757)
    .setTitle('💣  Nuke This Channel?')
    .setDescription(
      `This will **permanently delete every message** in ${channel} by recreating the channel from scratch.\n` +
      'This action **cannot be undone**.\n\n' +
      `Confirm within ${CONFIRM_TIMEOUT_MS / 1000} seconds.`,
    )
    .setTimestamp();

  const confirmMsg = await message.reply({ embeds: [warningEmbed], components: [confirmRow] });

  let response;
  try {
    response = await confirmMsg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: CONFIRM_TIMEOUT_MS,
      filter: (interaction) => interaction.user.id === message.author.id,
    });
  } catch {
    const expiredEmbed = new EmbedBuilder()
      .setColor(0x747d8c)
      .setTitle('⌛  Nuke Cancelled')
      .setDescription('Confirmation timed out — no changes were made.')
      .setTimestamp();
    return confirmMsg.edit({ embeds: [expiredEmbed], components: [] });
  }

  if (response.customId === 'nuke_cancel') {
    const cancelledEmbed = new EmbedBuilder()
      .setColor(0x747d8c)
      .setTitle('🚫  Nuke Cancelled')
      .setDescription('No changes were made.')
      .setTimestamp();
    return response.update({ embeds: [cancelledEmbed], components: [] });
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  try {
    await response.update({
      embeds: [new EmbedBuilder().setColor(0xffd32a).setTitle('💣  Nuking channel…').setTimestamp()],
      components: [],
    });

    const clone = await channel.clone({ reason: `${message.author.tag}: channel nuke` });
    await clone.setPosition(channel.position);
    await channel.delete(`${message.author.tag}: channel nuke`);

    const doneEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💥  Channel Nuked')
      .setDescription(`This channel was wiped by ${message.author.tag}.`)
      .setTimestamp();

    await clone.send({ embeds: [doneEmbed] });
  } catch (err) {
    console.error('[nuke]', err);
    await channel.send({ embeds: [errorEmbed('Failed to nuke this channel.')] }).catch(() => {});
  }
}

function noPermEmbed(desc) {
  return new EmbedBuilder().setColor(0xff6b81).setTitle('🚫  No Permission').setDescription(desc).setTimestamp();
}

function errorEmbed(desc) {
  return new EmbedBuilder().setColor(0xff4757).setTitle('❌  Error').setDescription(desc).setTimestamp();
}

module.exports = {
  execute,
  description: 'Wipe an entire channel by cloning and deleting it (requires confirmation)',
  usage: 'nuke',
  category: 'Moderation',
};
