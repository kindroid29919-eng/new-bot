/**
 * trade.js — x!trade @user <your_number> for <their_number|petal_amount>
 *
 * Two modes:
 *   Waifu for Waifu:   x!trade @user 2 for 1      (your harem slot 2 for their slot 1)
 *   Waifu for Petals:  x!trade @user 3 for 500     (your harem slot 3 for 500 Petals)
 *
 * The other user gets a DM (or channel mention) with Accept/Decline buttons.
 * Offer expires after 60 seconds.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../utils/db.js');

// Pending trades: tradeId → tradeState
const pendingTrades = new Map();

const TIER_EMOJI  = { Legendary: '🌟', Epic: '💎', Rare: '🔥', Uncommon: '✨', Common: '⚪' };
const OFFER_TTL   = 60_000; // 60 s

function genId() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function execute(message, args) {
  // Parse: @user <yourSlot> for <theirSlot|amount>
  // args example: ['@mention', '2', 'for', '1']
  const target = message.mentions.users.first();
  if (!target) return message.reply('Usage: `x!trade @user <your_slot> for <their_slot or petal_amount>`');
  if (target.id === message.author.id) return message.reply("You can't trade with yourself.");
  if (target.bot) return message.reply("Bots don't collect waifus.");

  // Strip mention token from args, find "for" separator
  const cleanArgs = args.filter(a => !a.startsWith('<@'));
  const forIdx    = cleanArgs.findIndex(a => a.toLowerCase() === 'for');
  if (forIdx < 1 || forIdx + 1 >= cleanArgs.length) {
    return message.reply('Usage: `x!trade @user <your_slot> for <their_slot or amount>`\nExample: `x!trade @Someone 2 for 1`');
  }

  const yourSlot  = parseInt(cleanArgs[forIdx - 1], 10);
  const theirSide = cleanArgs[forIdx + 1];

  if (!yourSlot || yourSlot < 1) return message.reply('❌ Invalid slot number for your side.');

  const [yourHarem, theirHarem] = await Promise.all([
    db.getHarem(message.author.id),
    db.getHarem(target.id),
  ]);

  const yourChar = yourHarem[yourSlot - 1];
  if (!yourChar) {
    return message.reply(
      `You don't have a character at slot #${yourSlot}. Check \`x!harem\` for your list.`,
    );
  }

  // Detect mode: waifu-for-waifu or waifu-for-petals
  const theirSlotNum  = parseInt(theirSide, 10);
  const isWaifuTrade  = !isNaN(theirSlotNum) && theirHarem[theirSlotNum - 1];

  let theirChar  = null;
  let petalAsk   = 0;
  let offerDesc  = '';

  if (isWaifuTrade) {
    theirChar = theirHarem[theirSlotNum - 1];
    offerDesc =
      `**${TIER_EMOJI[yourChar.tier]} ${yourChar.character_name}** *(${yourChar.tier})*\n` +
      `⇄\n` +
      `**${TIER_EMOJI[theirChar.tier]} ${theirChar.character_name}** *(${theirChar.tier})*`;
  } else {
    // Petal trade
    petalAsk = parseInt(theirSide, 10);
    if (!petalAsk || petalAsk < 1) {
      return message.reply('❌ Specify their slot number OR a petal amount. Example: `x!trade @user 2 for 1` or `x!trade @user 2 for 500`');
    }
    offerDesc =
      `**${TIER_EMOJI[yourChar.tier]} ${yourChar.character_name}** *(${yourChar.tier})*\n` +
      `⇄\n` +
      `**${petalAsk.toLocaleString()} 🌸 Petals**`;
  }

  const tradeId = genId();

  // Build DM embed + buttons
  const embed = new EmbedBuilder()
    .setColor(0x6c5ce7)
    .setTitle('🔄 Trade Offer')
    .setDescription(
      `**${message.author.username}** wants to trade with you!\n\n${offerDesc}`,
    )
    .addFields(
      { name: 'From', value: `<@${message.author.id}>`, inline: true },
      { name: 'To',   value: `<@${target.id}>`,         inline: true },
    )
    .setFooter({ text: 'You have 60 seconds to decide' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade_accept_${tradeId}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`trade_decline_${tradeId}`)
      .setLabel('❌ Decline')
      .setStyle(ButtonStyle.Danger),
  );

  // Try DM; fall back to channel ping
  let dmMsg = null;
  let sentInChannel = false;
  try {
    const dm = await target.createDM();
    dmMsg = await dm.send({ embeds: [embed], components: [row] });
  } catch {
    // DMs blocked — post in channel instead
    dmMsg = await message.channel.send({
      content: `<@${target.id}>, you have a trade offer!`,
      embeds: [embed],
      components: [row],
    });
    sentInChannel = true;
  }

  pendingTrades.set(tradeId, {
    tradeId,
    offererId:      message.author.id,
    accepterId:     target.id,
    channelId:      message.channel.id,
    yourCharId:     yourChar.id,
    yourCharName:   yourChar.character_name,
    yourCharTier:   yourChar.tier,
    theirCharId:    theirChar?.id ?? null,
    theirCharName:  theirChar?.character_name ?? null,
    theirCharTier:  theirChar?.tier ?? null,
    petalAsk,
    mode:           isWaifuTrade ? 'waifu' : 'petals',
    dmMsg,
    sentInChannel,
  });

  await message.reply(
    sentInChannel
      ? `📬 Trade offer posted above — <@${target.id}> can accept or decline directly.`
      : `📬 Trade offer sent to **${target.username}** via DM!`,
  );

  // Auto-expire
  setTimeout(async () => {
    if (!pendingTrades.has(tradeId)) return;
    pendingTrades.delete(tradeId);
    try {
      await dmMsg.edit({ content: '⏰ Trade offer expired.', embeds: [], components: [] });
    } catch {}
  }, OFFER_TTL);
}

// Called from index.js interactionCreate
async function handleInteraction(interaction) {
  const { customId } = interaction;
  if (customId.startsWith('trade_accept_')) {
    await handleAccept(interaction, customId.replace('trade_accept_', ''));
  } else if (customId.startsWith('trade_decline_')) {
    await handleDecline(interaction, customId.replace('trade_decline_', ''));
  }
}

async function handleAccept(interaction, tradeId) {
  const trade = pendingTrades.get(tradeId);
  if (!trade) {
    return interaction.update({ content: '⏰ This trade has already expired or been completed.', embeds: [], components: [] }).catch(() => {});
  }
  if (interaction.user.id !== trade.accepterId) {
    return interaction.reply({ content: "This trade offer isn't for you.", ephemeral: true }).catch(() => {});
  }

  pendingTrades.delete(tradeId);

  try {
    if (trade.mode === 'waifu') {
      // Both chars must still exist
      const [offererHarem, accepterHarem] = await Promise.all([
        db.getHarem(trade.offererId),
        db.getHarem(trade.accepterId),
      ]);

      const offererStillHas  = offererHarem.some(c => c.id === trade.yourCharId);
      const accepterStillHas = accepterHarem.some(c => c.id === trade.theirCharId);

      if (!offererStillHas) {
        await interaction.update({ content: '❌ Trade failed — the offerer no longer has that character.', embeds: [], components: [] }).catch(() => {});
        return;
      }
      if (!accepterStillHas) {
        await interaction.update({ content: "❌ Trade failed — you no longer have that character.", embeds: [], components: [] }).catch(() => {});
        return;
      }

      // Swap
      await Promise.all([
        db.transferHaremEntry(trade.yourCharId,  trade.offererId,  trade.accepterId),
        db.transferHaremEntry(trade.theirCharId, trade.accepterId, trade.offererId),
      ]);

      await interaction.update({ embeds: [], components: [] }).catch(() => {});

      const resultEmbed = new EmbedBuilder()
        .setColor(0x2ed573)
        .setTitle('✅ Trade Complete!')
        .setDescription(
          `<@${trade.offererId}> and <@${trade.accepterId}> swapped characters!\n\n` +
          `**${TIER_EMOJI[trade.yourCharTier]} ${trade.yourCharName}** → <@${trade.accepterId}>\n` +
          `**${TIER_EMOJI[trade.theirCharTier]} ${trade.theirCharName}** → <@${trade.offererId}>`,
        )
        .setTimestamp();

      await interaction.message.edit({ embeds: [resultEmbed], components: [] }).catch(() => {});

    } else {
      // Petal trade: accepter pays petals, gets the character
      const ok = await db.transferBalance(trade.accepterId, trade.offererId, trade.petalAsk);
      if (!ok) {
        const bal = await db.getBalance(trade.accepterId);
        await interaction.update({
          content: `❌ Trade failed — you need **${trade.petalAsk} 🌸 Petals** but only have **${bal}**.`,
          embeds: [], components: [],
        }).catch(() => {});
        return;
      }

      // Transfer character from offerer to accepter
      await db.transferHaremEntry(trade.yourCharId, trade.offererId, trade.accepterId);

      const resultEmbed = new EmbedBuilder()
        .setColor(0x2ed573)
        .setTitle('✅ Trade Complete!')
        .setDescription(
          `<@${trade.accepterId}> bought **${TIER_EMOJI[trade.yourCharTier]} ${trade.yourCharName}** ` +
          `from <@${trade.offererId}> for **${trade.petalAsk.toLocaleString()} 🌸 Petals**!`,
        )
        .setTimestamp();

      await interaction.update({ embeds: [resultEmbed], components: [] }).catch(() => {});
    }
  } catch (err) {
    console.error('[trade] accept error:', err);
    await interaction.update({ content: '⚠️ Something went wrong completing the trade.', embeds: [], components: [] }).catch(() => {});
  }
}

async function handleDecline(interaction, tradeId) {
  const trade = pendingTrades.get(tradeId);
  if (!trade) {
    return interaction.update({ content: '⏰ Trade already expired.', embeds: [], components: [] }).catch(() => {});
  }
  if (interaction.user.id !== trade.accepterId) {
    return interaction.reply({ content: "This trade isn't for you.", ephemeral: true }).catch(() => {});
  }

  pendingTrades.delete(tradeId);
  await interaction.update({
    content: `❌ Trade declined.`,
    embeds: [],
    components: [],
  }).catch(() => {});
}

module.exports = {
  execute,
  handleInteraction,
  name: 'trade',
  aliases: [],
  description: 'Trade a waifu for another waifu or for Petals. Usage: x!trade @user <your_slot> for <their_slot or amount>',
  usage: 'trade @user <your_slot> for <their_slot|amount>',
  category: 'Economy',
};
