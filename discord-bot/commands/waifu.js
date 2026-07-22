/**
 * waifu.js — x!waifu  /  x!waifu 10
 *
 * Single pull  (x!waifu)     — costs 20 🌸 Petals. React 💍 within 60s to marry.
 * Ten-pull     (x!waifu 10)  — costs 200 🌸 Petals. Shows a banner with all 10.
 *   React 1️⃣–9️⃣ or 🅿️ (10th slot) to marry any you want within 60s.
 *
 * Pity system (three-tier hard pity):
 *   pulls_since_rare      ≥ 30  → guarantee Rare+  next pull
 *   pulls_since_epic      ≥ 50  → guarantee Epic+ (90% Epic, 10% Legendary)
 *   pulls_since_legendary ≥ 100 → guarantee Legendary
 *   All counters are tracked independently and reset on the corresponding tier.
 */

const { EmbedBuilder } = require('discord.js');
const { getRandomCharacter } = require('../utils/anilist.js');
const db = require('../utils/db.js');
const { getType, TYPE_EMOJI, TIER_EMOJI } = require('../utils/battleEngine.js');

// ── Constants ─────────────────────────────────────────────────────────────────
const PULL_COST        = 20;
const TEN_PULL_COST    = PULL_COST * 10; // 200
const DUPE_COMPENSATION = 100; // petals given when you pull a character you already own

const CLAIM_WINDOW_MS = 60_000;
const MARRY_EMOJI     = '💍';

// Reactions for 10-pull: 1️⃣–9️⃣ then 🅿️ for the tenth slot
const SLOT_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🅿️'];

const TIER_COLOR = {
  Legendary: 0xffd700,
  Epic:      0xa855f7,
  Rare:      0xff4757,
  Uncommon:  0x2ed573,
  Common:    0x95a5a6,
};

// Strip Unicode variation selectors so emoji comparisons are reliable
const norm = s => (s ?? '').replace(/\uFE0F/g, '');
const NORM_SLOTS = SLOT_EMOJIS.map(norm);

// ── Shared: execute one pity-aware pull, update in-memory pity state ──────────
/**
 * Pulls a single character respecting the current pity state.
 * Mutates `pityState` in place and returns the character (or null on API fail).
 *
 * @param {{ pulls_since_rare, pulls_since_epic, pulls_since_legendary }} pityState — mutated in place
 * @param {Set<number>|null} seenIds — ids already pulled this session; prevents duplicates
 */
async function pullOne(pityState, seenIds = null) {
  const opts = db.pityOpts(pityState);
  const char = await getRandomCharacter(opts, seenIds);

  // NOTE (Bug 1 fix): this used to fall back to an Epic pull whenever a
  // requireLegendary roll came back empty. That fallback was NOT credited
  // as a Legendary, so pulls_since_legendary stayed >= 100 — which meant
  // pityOpts() kept returning requireLegendary on every remaining slot of
  // the 10-pull, and every one of them hit the same fallback. That's why
  // the "guaranteed 101st pull" was coming back as 10 Epics instead of
  // 1 Legendary + 9 normal pulls.
  //
  // Bug 2's fix (see utils/anilist.js — local Legendary supplement) means
  // getRandomCharacter({ requireLegendary: true }) now reliably succeeds
  // without widening pagination. If it still somehow returns null (e.g.
  // AniList AND the local pool are both unavailable), we no longer paper
  // over it with a lower tier: the caller's existing null-handling
  // (refund the petals for that slot) takes over instead, and the pity
  // counter correctly stays un-reset so the guarantee is still owed next
  // time.
  if (char) {
    if (seenIds) seenIds.add(char.id);
    Object.assign(pityState, db.advancePityState(pityState, char.tier.name));
  }
  return char;
}

// ── Single pull ───────────────────────────────────────────────────────────────
async function executeSingle(message) {
  const userId = message.author.id;

  const [balance, haremCount] = await Promise.all([
    db.getBalance(userId),
    db.countHarem(userId),
  ]);

  if (balance < PULL_COST) {
    return message.reply(
      `🌸 You need **${PULL_COST} Petals** to pull — you only have **${balance}**.\n` +
      `Earn more with \`x!daily\`, \`x!coinflip\`, or \`x!duel\`!`,
    );
  }
  if (haremCount >= db.MAX_HAREM_SIZE) {
    return message.reply(
      `💔 Your harem is full (${db.MAX_HAREM_SIZE}/${db.MAX_HAREM_SIZE})!\n` +
      `Use \`x!unmarry <number>\` to release someone first.`,
    );
  }

  const ok = await db.deductBalance(userId, PULL_COST);
  if (!ok) return message.reply(`🌸 Insufficient balance — please try again.`);

  const pityState = await db.getPityState(userId);
  const character = await pullOne(pityState);

  if (!character) {
    await db.addBalance(userId, PULL_COST);
    return message.reply("⚠️ Couldn't reach the character database — your Petals were refunded. Try again in a bit.");
  }

  // Persist updated pity + log pull
  await Promise.all([
    db.setPityState(userId, pityState),
    db.logPull(userId),
  ]);

  const newBalance = await db.getBalance(userId);

  const elemType = getType(character.id);
  const embed = new EmbedBuilder()
    .setColor(TIER_COLOR[character.tier.name] ?? 0xff85c0)
    .setTitle(`${TIER_EMOJI[character.tier.name]} ${character.name}`)
    .setDescription(
      `**From:** ${character.source}\n` +
      `**Tier:** ${TIER_EMOJI[character.tier.name]} ${character.tier.name}\n` +
      `**Element:** ${TYPE_EMOJI[elemType]} ${elemType}\n\n` +
      `React with ${MARRY_EMOJI} within **60 seconds** to marry them!`,
    )
    .setFooter({ text: `🌸 ${newBalance} Petals remaining • ${PULL_COST} Petals per pull` })
    .setTimestamp();

  if (character.image) embed.setImage(character.image);

  const sent = await message.reply({ embeds: [embed] });
  await sent.react(MARRY_EMOJI);

  const collector = sent.createReactionCollector({
    filter: (reaction, user) =>
      norm(reaction.emoji.name) === norm(MARRY_EMOJI) && user.id === userId,
    time: CLAIM_WINDOW_MS,
    max: 1,
  });

  collector.on('collect', async () => {
    const alreadyOwned = await db.isInHarem(userId, character.id);
    if (alreadyOwned) {
      await db.addBalance(userId, DUPE_COMPENSATION);
      await sent.edit({
        embeds: [EmbedBuilder.from(embed)
          .setDescription(
            `**From:** ${character.source}\n` +
            `**Tier:** ${TIER_EMOJI[character.tier.name]} ${character.tier.name}\n\n` +
            `🔁 You already have **${character.name}**! Received **${DUPE_COMPENSATION} 🌸 Petals** as compensation.`,
          )
          .setColor(0xf39c12)],
      }).catch(() => {});
      return;
    }
    try {
      await db.addToHarem(userId, character);
    } catch (err) {
      console.error('[waifu] addToHarem failed:', err);
      await sent.reply('⚠️ Something went wrong saving that marriage — please try `x!waifu` again.').catch(() => {});
      return;
    }
    await sent.edit({
      embeds: [EmbedBuilder.from(embed)
        .setDescription(
          `**From:** ${character.source}\n` +
          `**Tier:** ${TIER_EMOJI[character.tier.name]} ${character.tier.name}\n\n` +
          `💍 Married to <@${userId}>! Check \`x!harem\` to see your collection.`,
        )
        .setColor(0x2ed573)],
    }).catch(() => {});
  });

  collector.on('end', async (collected) => {
    if (!collected.size) {
      await sent.edit({
        embeds: [EmbedBuilder.from(embed)
          .setDescription(
            `**From:** ${character.source}\n` +
            `**Tier:** ${TIER_EMOJI[character.tier.name]} ${character.tier.name}\n\n` +
            `💨 ${character.name} got away — too slow!`,
          )
          .setColor(0x636e72)],
      }).catch(() => {});
    }
    await sent.reactions.removeAll().catch(() => {});
  });
}

// ── 10-pull banner ────────────────────────────────────────────────────────────
async function executeTenPull(message) {
  const userId = message.author.id;

  const [balance, haremCount] = await Promise.all([
    db.getBalance(userId),
    db.countHarem(userId),
  ]);

  if (balance < TEN_PULL_COST) {
    return message.reply(
      `🌸 You need **${TEN_PULL_COST} Petals** for a 10-pull — you only have **${balance}**.\n` +
      `You can also do a single pull with just \`x!waifu\` (${PULL_COST} Petals).`,
    );
  }
  if (haremCount >= db.MAX_HAREM_SIZE) {
    return message.reply(
      `💔 Your harem is full (${db.MAX_HAREM_SIZE}/${db.MAX_HAREM_SIZE})!\n` +
      `Use \`x!unmarry <number>\` to release someone first.`,
    );
  }

  const ok = await db.deductBalance(userId, TEN_PULL_COST);
  if (!ok) return message.reply(`🌸 Insufficient balance — please try again.`);

  // ── Pull 10 characters sequentially (pity must advance after each pull) ────
  const pityState = await db.getPityState(userId);
  const pulls = [];
  let refundPulls = 0;
  // seenIds deduplicates within this 10-pull session
  const seenIds = new Set();

  for (let i = 0; i < 10; i++) {
    let char = null;
    // Retry up to 3 times before giving up on this slot, so API hiccups
    // don't silently shrink a 10-pull to 6 or 7 characters.
    for (let attempt = 0; attempt < 3 && !char; attempt++) {
      char = await pullOne(pityState, seenIds);
    }
    if (char) {
      pulls.push(char);
    } else {
      refundPulls++;
    }
  }

  // Persist updated pity + log all successful pulls
  const logOps = pulls.map(() => db.logPull(userId));
  await Promise.all([db.setPityState(userId, pityState), ...logOps]);

  if (refundPulls) {
    await db.addBalance(userId, refundPulls * PULL_COST);
  }

  if (!pulls.length) {
    await db.addBalance(userId, TEN_PULL_COST);
    return message.reply("⚠️ Couldn't reach the character database — all Petals refunded. Try again in a bit.");
  }

  const newBalance = await db.getBalance(userId);

  // Track claim state per pull index
  // claimStatus[i]: 'pending' | 'married' | 'full' | 'dupe'
  const claimStatus = pulls.map(() => 'pending');
  let slotsUsed = haremCount; // tracks harem size locally to avoid extra DB calls

  const buildEmbed = (final = false) => {
    const lines = pulls.map((char, i) => {
      const emoji   = SLOT_EMOJIS[i];
      const elemT   = getType(char.id);
      const status  = claimStatus[i] === 'married' ? '✅'
        : claimStatus[i] === 'full'  ? '🚫'
        : claimStatus[i] === 'dupe'  ? `🔁 (+${DUPE_COMPENSATION}🌸)`
        : final ? '💨' : '⬜';
      return `${emoji} ${TIER_EMOJI[char.tier.name]} ${TYPE_EMOJI[elemT]} **${char.name}** — *${char.source}*  ${status}`;
    });

    const claimed  = claimStatus.filter(s => s === 'married').length;
    const dupes    = claimStatus.filter(s => s === 'dupe').length;
    const footer   = final
      ? `${claimed} married${dupes ? `, ${dupes} dupe (${dupes * DUPE_COMPENSATION}🌸 back)` : ''}, ${pulls.length - claimed - dupes} escaped • 🌸 ${newBalance} Petals remaining`
      : `React with the numbers to marry! 60s window • 🌸 ${newBalance} Petals remaining`;

    // Highlight the best tier colour in the banner
    const bestTier = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common']
      .find(t => pulls.some(c => c.tier.name === t)) ?? 'Common';

    return new EmbedBuilder()
      .setColor(TIER_COLOR[bestTier])
      .setTitle(final ? '🎰 10-Pull — Time\'s up!' : '🎰 10-Pull Banner')
      .setDescription(lines.join('\n'))
      .setFooter({ text: footer })
      .setTimestamp();
  };

  // Post the initial banner
  const sent = await message.reply({ embeds: [buildEmbed()] });

  // Add reactions sequentially (Discord requires sequential react calls)
  for (let i = 0; i < pulls.length; i++) {
    await sent.react(SLOT_EMOJIS[i]).catch(() => {});
  }

  // ── Collect reactions ─────────────────────────────────────────────────────
  const collector = sent.createReactionCollector({
    filter: (reaction, user) =>
      user.id === userId && NORM_SLOTS.includes(norm(reaction.emoji.name)),
    time: CLAIM_WINDOW_MS,
  });

  collector.on('collect', async (reaction) => {
    const idx = NORM_SLOTS.indexOf(norm(reaction.emoji.name));
    if (idx === -1 || idx >= pulls.length) return;
    if (claimStatus[idx] !== 'pending') return; // already acted on

    // Check for duplicate before anything else
    const alreadyOwned = await db.isInHarem(userId, pulls[idx].id);
    if (alreadyOwned) {
      claimStatus[idx] = 'dupe';
      await db.addBalance(userId, DUPE_COMPENSATION);
      await sent.edit({ embeds: [buildEmbed()] }).catch(() => {});
      return;
    }

    if (slotsUsed >= db.MAX_HAREM_SIZE) {
      claimStatus[idx] = 'full';
      await sent.edit({ embeds: [buildEmbed()] }).catch(() => {});
      return;
    }

    try {
      await db.addToHarem(userId, pulls[idx]);
    } catch (err) {
      console.error('[waifu] addToHarem failed:', err);
      await sent.reply('⚠️ Something went wrong saving that marriage — please try again.').catch(() => {});
      return;
    }
    claimStatus[idx] = 'married';
    slotsUsed++;
    await sent.edit({ embeds: [buildEmbed()] }).catch(() => {});
  });

  collector.on('end', async () => {
    await sent.edit({ embeds: [buildEmbed(true)] }).catch(() => {});
    await sent.reactions.removeAll().catch(() => {});
  });
}

// ── Command entry point ───────────────────────────────────────────────────────
async function execute(message, args) {
  if (args[0] === '10') {
    return executeTenPull(message);
  }
  return executeSingle(message);
}

module.exports = {
  execute,
  name: 'waifu',
  aliases: [],
  description:
    `Pull a random anime character for ${PULL_COST} 🌸 Petals (react 💍 to marry), ` +
    `or \`x!waifu 10\` for a 200-Petal 10-pull banner!`,
  usage: 'waifu [10]',
  category: 'Game',
};
