/**
 * shop.js — x!shop  /  x!shop buy <id>
 * Fixed-price character shop. Characters are premium — you can only buy each
 * one once per account. Add more entries to SHOP_ITEMS as needed.
 *
 * To add a character:
 *   { id, name, source, tier, characterId, price, imageUrl }
 *   character_id is used for elemental type: TYPES[character_id % 5]
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');
const { getType, TYPE_EMOJI, TIER_EMOJI } = require('../utils/battleEngine.js');

// ── Shop inventory (add/remove entries here freely) ───────────────────────────
const SHOP_ITEMS = [
  {
    id: 1,
    name: 'Tokisaki Kurumi',
    source: 'Date A Live',
    tier: 'Legendary',
    characterId: 45748,
    price: 3000,
    imageUrl: null, // set to AniList image URL when known
  },
  {
    id: 2,
    name: 'Mahiru Shiina',
    source: 'Otonari no Tenshi-sama',
    tier: 'Legendary',
    characterId: 192342,
    price: 3000,
    imageUrl: null,
  },
];

const TIER_COLOR = {
  Legendary: 0xffd700, Epic: 0xa855f7, Rare: 0xff4757, Uncommon: 0x2ed573, Common: 0x95a5a6,
};

async function execute(message, args) {
  // ── x!shop — list the store ───────────────────────────────────────────────
  if (!args.length || args[0].toLowerCase() !== 'buy') {
    const lines = SHOP_ITEMS.map(item => {
      const type = getType(item.characterId);
      return (
        `**${item.id}.** ${TIER_EMOJI[item.tier]} **${item.name}** — *${item.source}*\n` +
        `　${TYPE_EMOJI[type]} ${type} | **${item.price.toLocaleString()} 🌸 Petals**`
      );
    });

    const balance = await db.getBalance(message.author.id);

    const embed = new EmbedBuilder()
      .setColor(0xff85c0)
      .setTitle('🌸 Waifu Shop')
      .setDescription(
        `Premium characters available for **fixed Petal prices**.\n` +
        `Each character can only be purchased **once per account**.\n\n` +
        lines.join('\n\n'),
      )
      .addFields({ name: '💰 Your balance', value: `${balance.toLocaleString()} 🌸 Petals`, inline: true })
      .setFooter({ text: `x!shop buy <id> — e.g. x!shop buy 1` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ── x!shop buy <id> ───────────────────────────────────────────────────────
  const itemId = parseInt(args[1], 10);
  if (!itemId || isNaN(itemId)) {
    return message.reply(`❌ Usage: \`x!shop buy <number>\` — check \`x!shop\` for the list.`);
  }

  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) {
    return message.reply(`❌ No shop item with ID **${itemId}**. Use \`x!shop\` to see what's available.`);
  }

  // Check harem capacity
  const haremCount = await db.countHarem(message.author.id);
  if (haremCount >= db.MAX_HAREM_SIZE) {
    return message.reply(
      `💔 Your harem is full (${db.MAX_HAREM_SIZE}/${db.MAX_HAREM_SIZE})!\n` +
      `Use \`x!unmarry <number>\` to release someone before buying.`,
    );
  }

  // Check if already purchased
  const alreadyOwned = await db.hasShopItem(message.author.id, item.id);
  if (alreadyOwned) {
    return message.reply(
      `💍 You already own **${item.name}** from the shop!\n` +
      `Each character can only be purchased once. Check \`x!harem\` to see them.`,
    );
  }

  // Balance check
  const balance = await db.getBalance(message.author.id);
  if (balance < item.price) {
    const needed = item.price - balance;
    return message.reply(
      `💸 You need **${item.price.toLocaleString()} 🌸 Petals** — you're short by **${needed.toLocaleString()}**.\n` +
      `Earn more with \`x!daily\`, \`x!coinflip\`, \`x!slots\`, or \`x!blackjack\`!`,
    );
  }

  // Deduct, record purchase, add to harem
  const deducted = await db.deductBalance(message.author.id, item.price);
  if (!deducted) {
    return message.reply(`💸 Insufficient balance — please try again.`);
  }

  await db.recordShopPurchase(message.author.id, item.id);

  const haremCharacter = {
    id:         item.characterId,
    name:       item.name,
    source:     item.source,
    image:      item.imageUrl,
    favourites: 999999,           // show at top of sort
    tier: { name: item.tier },
  };
  await db.addToHarem(message.author.id, haremCharacter);

  const type     = getType(item.characterId);
  const newBal   = await db.getBalance(message.author.id);

  const embed = new EmbedBuilder()
    .setColor(TIER_COLOR[item.tier] || 0xff85c0)
    .setTitle(`🌸 Purchase Successful!`)
    .setDescription(
      `${TIER_EMOJI[item.tier]} **${item.name}** has joined your harem!\n` +
      `*From: ${item.source}*\n` +
      `${TYPE_EMOJI[type]} Element: **${type}**\n\n` +
      `💰 Remaining balance: **${newBal.toLocaleString()} Petals**\n` +
      `Check them out with \`x!harem\` or \`x!view\`.`,
    )
    .setTimestamp();

  if (item.imageUrl) embed.setThumbnail(item.imageUrl);

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'shop',
  aliases: ['store', 'market'],
  description: 'Browse and buy premium characters at fixed Petal prices.',
  usage: 'shop [buy <id>]',
  category: 'Economy',
};
