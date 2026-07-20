/**
 * waifu.js — x!waifu
 * Pull a random anime character. Costs 20 🌸 Petals per pull (no hourly limit).
 * React 💍 within 60s to marry the character.
 */

const { EmbedBuilder } = require('discord.js');
const { getRandomCharacter } = require('../utils/anilist.js');
const db = require('../utils/db.js');

const MARRY_EMOJI     = '💍';
const CLAIM_WINDOW_MS = 60_000;
const PULL_COST       = 20;

const tierColor = {
  Legendary: 0xffd700,
  Epic:      0xa855f7,
  Rare:      0xff4757,
  Uncommon:  0x2ed573,
  Common:    0x95a5a6,
};

async function execute(message) {
  const userId = message.author.id;

  // ── Balance check ─────────────────────────────────────────────────────────
  const balance = await db.getBalance(userId);
  if (balance < PULL_COST) {
    return message.reply(
      `🌸 You need **${PULL_COST} Petals** to pull — you only have **${balance}**.\n` +
      `Earn more with \`x!daily\`, \`x!coinflip\`, or \`x!duel\`!`,
    );
  }

  // ── Harem full check ──────────────────────────────────────────────────────
  const count = await db.countHarem(userId);
  if (count >= db.MAX_HAREM_SIZE) {
    return message.reply(
      `💔 Your harem is full (${db.MAX_HAREM_SIZE}/${db.MAX_HAREM_SIZE})!\n` +
      `Use \`x!unmarry <number>\` to release someone before pulling again.`,
    );
  }

  // ── Deduct cost before pull (non-refundable, like a real gacha) ───────────
  const ok = await db.deductBalance(userId, PULL_COST);
  if (!ok) {
    return message.reply(
      `🌸 You need **${PULL_COST} Petals** to pull — you only have **${balance}**.\n` +
      `Earn more with \`x!daily\`, \`x!coinflip\`, or \`x!duel\`!`,
    );
  }

  // ── Pity check ────────────────────────────────────────────────────────────
  const pity = await db.getPity(userId);
  const forcePity = pity >= 50;

  const character = await getRandomCharacter({ requireEpicOrBetter: forcePity });
  if (!character) {
    // Refund on API failure
    await db.addBalance(userId, PULL_COST);
    return message.reply("⚠️ Couldn't reach the character database right now — try again in a bit. Your Petals were refunded.");
  }

  // ── Log pull + update pity ────────────────────────────────────────────────
  const isEpicOrBetter = ['Epic', 'Legendary'].includes(character.tier.name);
  await Promise.all([
    db.logPull(userId),
    db.bumpPity(userId, isEpicOrBetter),
  ]);

  const newBalance = await db.getBalance(userId);

  const embed = new EmbedBuilder()
    .setColor(tierColor[character.tier.name] || 0xff85c0)
    .setTitle(`${character.tier.emoji} ${character.name}`)
    .setDescription(
      `**From:** ${character.source}\n` +
      `**Tier:** ${character.tier.emoji} ${character.tier.name}\n\n` +
      `React with ${MARRY_EMOJI} within **60 seconds** to marry them!`,
    )
    .setFooter({ text: `🌸 ${newBalance} Petals remaining • Cost: ${PULL_COST} Petals per pull` })
    .setTimestamp();

  if (character.image) embed.setImage(character.image);

  const sent = await message.reply({ embeds: [embed] });
  await sent.react(MARRY_EMOJI);

  const collector = sent.createReactionCollector({
    filter: (reaction, user) =>
      reaction.emoji.name === MARRY_EMOJI && user.id === userId,
    time: CLAIM_WINDOW_MS,
    max: 1,
  });

  collector.on('collect', async () => {
    await db.addToHarem(userId, character);

    const marriedEmbed = EmbedBuilder.from(embed)
      .setDescription(
        `**From:** ${character.source}\n` +
        `**Tier:** ${character.tier.emoji} ${character.tier.name}\n\n` +
        `💍 Married to <@${userId}>! Check \`x!harem\` to see your collection.`,
      )
      .setColor(0x2ed573);

    await sent.edit({ embeds: [marriedEmbed] }).catch(() => {});
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      const escapedEmbed = EmbedBuilder.from(embed)
        .setDescription(
          `**From:** ${character.source}\n` +
          `**Tier:** ${character.tier.emoji} ${character.tier.name}\n\n` +
          `💨 ${character.name} got away — too slow!`,
        )
        .setColor(0x636e72);
      await sent.edit({ embeds: [escapedEmbed] }).catch(() => {});
    }
    await sent.reactions.removeAll().catch(() => {});
  });
}

module.exports = {
  execute,
  name: 'waifu',
  aliases: [],
  description: `Pull a random anime character for ${PULL_COST} 🌸 Petals — react 💍 within 60s to marry them!`,
  usage: 'waifu',
  category: 'Game',
};
