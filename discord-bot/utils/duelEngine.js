/**
 * duelEngine.js — x!duel 1v1 handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Supports:
 *   • PvP duel  (x!duel @user)  — both players pick fighter + stance via DM
 *   • Bot duel  (x!duel bot)    — instant, user picks fighter, bot auto-picks
 *
 * XP on win: 30 XP (PvP) / 20 XP (vs Bot) to the winning character.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, EmbedBuilder, AttachmentBuilder,
} = require('discord.js');

const db     = require('./db.js');
const engine = require('./battleEngine.js');
const { drawBattleFrame } = require('./battleCanvas.js');
const { getRandomCharacter } = require('./anilist.js');

const {
  TYPE_EMOJI, TIER_EMOJI, TIER_REWARD_MULT, parseCustomEmoji,
  LEVEL_EMOJI, LEVELUP_EMOJI, BOT_EMOJI, VS_EMOJI,
  createFighter, resolveDuel,
} = engine;

const BASE_REWARD    = 50;
const CONSOLATION    = 10;
const INVITE_TIMEOUT = 60_000;
const PICK_TIMEOUT   = 90_000;
const TURN_ANIM_MS   = 1_500;

const TIER_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const tierRank = tier => Math.max(0, TIER_ORDER.indexOf(tier));
const bestTier = harem => harem.reduce((best, r) => tierRank(r.tier) > tierRank(best) ? r.tier : best, 'Common');

const activeDuels = new Map();
const userInDuel  = new Map();

let _client = null;
function init(client) { _client = client; }
function isUserInDuel(userId) { return userInDuel.has(userId); }

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeBotLevel(harem) {
  const sorted = [...harem].sort((a, b) => (b.level || 1) - (a.level || 1));
  const top3   = sorted.slice(0, 3);
  const avg    = top3.length
    ? Math.round(top3.reduce((s, r) => s + (r.level || 1), 0) / top3.length)
    : 5;
  const offset = Math.floor(Math.random() * 6); // 0..5 stronger than your best
  return Math.max(1, Math.min(engine.MAX_LEVEL, avg + offset));
}

async function createBotRow(level, minTier = 'Common') {
  const minRank = tierRank(minTier);
  let opts = {};
  if (minRank >= 4) opts = { requireEpicOrBetter: true };
  else if (minRank >= 3) opts = { requireRareOrBetter: true };

  let char = null;
  try { char = await getRandomCharacter(opts); } catch {}
  if (char && tierRank(char.tier.name) >= minRank) {
    return {
      id: null, character_id: char.id, character_name: char.name,
      source_title: char.source, image_url: char.image,
      tier: char.tier.name, level,
    };
  }
  // Fallback
  return {
    id: null, character_id: 100000 + Math.floor(Math.random() * 800000),
    character_name: `${minTier} Bot Challenger`, source_title: 'System', image_url: null,
    tier: minTier, level,
  };
}

// ── Stance buttons ────────────────────────────────────────────────────────────
const STANCES = ['Aggressive', 'Defensive', 'Balanced', 'Berserker'];
const STANCE_DESC = {
  Aggressive: '⚔️ Always attacks — maximum pressure.',
  Defensive:  '🛡️ Defends until energy full, then Special.',
  Balanced:   '⚖️ Repeats winning moves, switches on loss.',
  Berserker:  '💢 Always attacks with ATK rising as HP drops.',
};

function buildStanceRow(duelId, userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel_stance_${duelId}_${userId}_Aggressive`).setLabel('⚔️ Aggressive').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`duel_stance_${duelId}_${userId}_Defensive`).setLabel('🛡️ Defensive').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel_stance_${duelId}_${userId}_Balanced`).setLabel('⚖️ Balanced').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`duel_stance_${duelId}_${userId}_Berserker`).setLabel('💢 Berserker').setStyle(ButtonStyle.Success),
    ),
  ];
}

// ── Character picker DM ───────────────────────────────────────────────────────
async function sendCharacterPicker(userId, duelId, harem) {
  const user = await _client.users.fetch(userId).catch(() => null);
  if (!user) return false;

  const options = harem.slice(0, 25).map((row, i) => {
    const type  = engine.getType(row.character_id);
    const level = row.level || 1;
    return {
      label:       `${i + 1}. ${row.character_name}`.slice(0, 100),
      emoji:       parseCustomEmoji(TIER_EMOJI[row.tier]),
      description: `${row.tier} | Lv ${level} | ${type}`.slice(0, 100),
      value:       String(i),
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`duel_pick_${duelId}_${userId}`)
    .setPlaceholder('Pick your fighter…')
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle('⚔️ Step 1 — Pick Your Fighter')
    .setDescription(
      'Choose which character will fight for you.\n' +
      'After picking, you\'ll choose a **combat stance**.\n\n' +
      'Characters are listed by tier (Legendary first).',
    )
    .setFooter({ text: 'You have 90 seconds to choose.' });

  try {
    await user.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    return true;
  } catch { return false; }
}

// ── Stance picker DM ──────────────────────────────────────────────────────────
async function sendStancePicker(userId, duelId, fighter) {
  const user = await _client.users.fetch(userId).catch(() => null);
  if (!user) return;

  const embed = new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle('⚔️ Step 2 — Choose Your Stance')
    .setDescription(
      `**Fighter:** ${TIER_EMOJI[fighter.tier]} ${fighter.name} ${LEVEL_EMOJI}Lv${fighter.level} ` +
      `(${TYPE_EMOJI[fighter.type]} ${fighter.type})\n` +
      `**HP:** ${fighter.maxHp} | **ATK:** ${fighter.atk} | **DEF:** ${fighter.def}\n\n` +
      Object.entries(STANCE_DESC).map(([k, v]) => `**${k}** — ${v}`).join('\n'),
    )
    .setFooter({ text: 'Stance drives every move. Choose wisely!' });

  await user.send({ embeds: [embed], components: buildStanceRow(duelId, userId) }).catch(() => {});
}

// ── Animate the resolved battle ───────────────────────────────────────────────
async function animateBattle(duel, fighterA, fighterB, log, channelId) {
  const channel = await _client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const snapA = { ...fighterA, currentHp: fighterA.maxHp, energy: 0 };
  const snapB = { ...fighterB, currentHp: fighterB.maxHp, energy: 0 };

  let battleMsg;
  try {
    const buf = await drawBattleFrame({ fighterA: snapA, fighterB: snapB, turn: 0, lastResult: '⚔️ Battle begins!', ended: false });
    battleMsg = await channel.send({ files: [new AttachmentBuilder(buf, { name: 'battle.png' })] });
  } catch (err) {
    console.error('[duel] failed to post opening frame:', err.message);
    return;
  }

  for (const entry of log) {
    await sleep(TURN_ANIM_MS);
    snapA.currentHp = entry.hpA; snapA.energy = entry.energyA;
    snapB.currentHp = entry.hpB; snapB.energy = entry.energyB;
    const caption = entry.typeNote ? `${entry.description} ${entry.typeNote}` : entry.description;
    try {
      const buf = await drawBattleFrame({ fighterA: snapA, fighterB: snapB, turn: entry.turn, lastResult: caption, ended: false });
      await battleMsg.edit({ files: [new AttachmentBuilder(buf, { name: 'battle.png' })] });
    } catch {}
  }

  return battleMsg;
}

// ── Award XP helper ───────────────────────────────────────────────────────────
async function tryAwardXP(userId, fighter, xpAmount) {
  if (!fighter.haremId) return null;
  return db.awardXP(userId, fighter.haremId, xpAmount).catch(() => null);
}

function xpLine(xpResult, fighter, xpAmount) {
  if (!xpResult) return `⚡ **+${xpAmount} XP** for ${fighter.name}`;
  if (xpResult.leveled) {
    return `${LEVELUP_EMOJI} **${fighter.name}** leveled up! **Lv ${xpResult.oldLevel} → Lv ${xpResult.newLevel}**\n⚡ +${xpAmount} XP`;
  }
  return `⚡ **+${xpAmount} XP** for ${fighter.name}`;
}

// ── PvP battle runner ─────────────────────────────────────────────────────────
async function runBattle(duel) {
  const fA = duel.challengerFighter;
  const fB = duel.opponentFighter;

  const channel = await _client.channels.fetch(duel.channelId).catch(() => null);
  if (channel) {
    const startEmbed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle('⚔️ The Battle Begins!')
      .setDescription(
        `<@${duel.challengerId}> sends **${fA.name}** ${TIER_EMOJI[fA.tier]} ${LEVEL_EMOJI}Lv${fA.level} ${TYPE_EMOJI[fA.type]} *(${fA.stance})*\n` +
        `<@${duel.opponentId}> sends **${fB.name}** ${TIER_EMOJI[fB.tier]} ${LEVEL_EMOJI}Lv${fB.level} ${TYPE_EMOJI[fB.type]} *(${fB.stance})*\n\n` +
        `The match resolves automatically — watch the frames update below!`,
      );
    await channel.send({ embeds: [startEmbed] }).catch(() => {});
  }

  const { winner, log } = resolveDuel(fA, fB);
  const winnerId  = winner === 'A' ? duel.challengerId : duel.opponentId;
  const loserId   = winner === 'A' ? duel.opponentId   : duel.challengerId;
  const winnerFtr = winner === 'A' ? fA : fB;
  const loserFtr  = winner === 'A' ? fB : fA;

  const battleMsg = await animateBattle(duel, fA, fB, log, duel.channelId);

  if (battleMsg) {
    await sleep(800);
    try {
      const buf = await drawBattleFrame({
        fighterA: { ...fA, currentHp: winnerFtr === fA ? fA.currentHp : 0 },
        fighterB: { ...fB, currentHp: winnerFtr === fB ? fB.currentHp : 0 },
        turn: log.length, lastResult: '🏆 Battle over!', ended: true,
        winnerName: (await _client.users.fetch(winnerId).catch(() => null))?.username ?? 'Unknown',
      });
      await battleMsg.edit({ files: [new AttachmentBuilder(buf, { name: 'battle.png' })] }).catch(() => {});
    } catch {}
  }

  const mult   = TIER_REWARD_MULT[loserFtr.tier] ?? 1;
  const payout = Math.round(BASE_REWARD * mult);

  const winnerXp = engine.xpForOpponent(winnerFtr, loserFtr);
  const loserXp  = Math.round(engine.xpForOpponent(loserFtr, winnerFtr) * 0.5);

  const [winXpResult, loseXpResult] = await Promise.all([
    tryAwardXP(winnerId, winnerFtr, winnerXp),
    tryAwardXP(loserId,  loserFtr,  loserXp),
    db.addBalance(winnerId, payout).catch(() => {}),
    db.addBalance(loserId, CONSOLATION).catch(() => {}),
    db.logDuel(winnerId, loserId, winnerFtr.name, loserFtr.name, log.length, payout).catch(() => {}),
  ]);

  if (channel) {
    const winnerUser = await _client.users.fetch(winnerId).catch(() => null);
    const loserUser  = await _client.users.fetch(loserId).catch(() => null);
    const resultEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 Duel Over!')
      .setDescription(
        `**Winner:** <@${winnerId}> with ${TIER_EMOJI[winnerFtr.tier]} **${winnerFtr.name}**\n` +
        `**Loser:** <@${loserId}> with ${TIER_EMOJI[loserFtr.tier]} **${loserFtr.name}**\n\n` +
        `🌸 **${winnerUser?.username ?? 'Winner'}** earns **${payout} Petals**!\n` +
        `🌸 **${loserUser?.username ?? 'Loser'}** gets **${CONSOLATION} Petals** consolation.\n` +
        xpLine(winXpResult, winnerFtr, winnerXp) + '\n' +
        xpLine(loseXpResult, loserFtr, loserXp),
      )
      .addFields(
        { name: 'Turns',          value: `${log.length}`,    inline: true },
        { name: 'Winning stance', value: winnerFtr.stance,   inline: true },
      );
    await channel.send({ embeds: [resultEmbed] }).catch(() => {});
  }

  cleanupDuel(duel.id);
}

// ── Bot battle runner ─────────────────────────────────────────────────────────
async function runBotBattle(duel) {
  const fA = duel.challengerFighter;
  const fB = duel.botFighter;

  const channel = await _client.channels.fetch(duel.channelId).catch(() => null);
  if (channel) {
    const startEmbed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle(`${BOT_EMOJI} Bot Duel Begins!`)
      .setDescription(
        `<@${duel.challengerId}> sends **${fA.name}** ${TIER_EMOJI[fA.tier]} ${LEVEL_EMOJI}Lv${fA.level} ${TYPE_EMOJI[fA.type]} *(${fA.stance})*\n` +
        `${BOT_EMOJI} **Bot** sends **${fB.name}** ${TIER_EMOJI[fB.tier]} ${LEVEL_EMOJI}Lv${fB.level} ${TYPE_EMOJI[fB.type]} *(${fB.stance})*\n\n` +
        `Defeat the bot to earn **XP** for your character!`,
      );
    await channel.send({ embeds: [startEmbed] }).catch(() => {});
  }

  const { winner, log } = resolveDuel(fA, fB);
  const userWon = winner === 'A';

  const battleMsg = await animateBattle(duel, fA, fB, log, duel.channelId);

  if (battleMsg) {
    await sleep(800);
    try {
      const buf = await drawBattleFrame({
        fighterA: { ...fA, currentHp: userWon ? fA.currentHp : 0 },
        fighterB: { ...fB, currentHp: userWon ? 0 : fB.currentHp },
        turn: log.length, lastResult: '🏆 Battle over!', ended: true,
        winnerName: userWon ? (await _client.users.fetch(duel.challengerId).catch(() => null))?.username ?? 'You' : 'Bot',
      });
      await battleMsg.edit({ files: [new AttachmentBuilder(buf, { name: 'battle.png' })] }).catch(() => {});
    } catch {}
  }

  const fighterXp = engine.xpForOpponent(fA, fB);
  const halfXp    = Math.round(fighterXp * 0.5);
  let xpResult = null;
  if (userWon) {
    xpResult = await tryAwardXP(duel.challengerId, fA, fighterXp);
    await db.addBalance(duel.challengerId, CONSOLATION).catch(() => {});
  } else {
    xpResult = await tryAwardXP(duel.challengerId, fA, halfXp);
  }

  if (channel) {
    const challengerUser = await _client.users.fetch(duel.challengerId).catch(() => null);
    const resultEmbed = new EmbedBuilder()
      .setColor(userWon ? 0xffd700 : 0xff4757)
      .setTitle(userWon ? `🏆 You beat the bot!` : `${BOT_EMOJI} Bot wins!`)
      .setDescription(
        userWon
          ? `**${challengerUser?.username ?? 'You'}** won with ${TIER_EMOJI[fA.tier]} **${fA.name}**!\n` +
            `🌸 **+${CONSOLATION} Petals** consolation\n` +
            xpLine(xpResult, fA, fighterXp)
          : `${BOT_EMOJI} **Bot** won with ${TIER_EMOJI[fB.tier]} **${fB.name}**.\n` +
            xpLine(xpResult, fA, halfXp),
      )
      .addFields(
        { name: 'Turns',      value: `${log.length}`, inline: true },
        { name: 'Bot stance', value: fB.stance,        inline: true },
      );
    await channel.send({ embeds: [resultEmbed] }).catch(() => {});
  }

  cleanupDuel(duel.id);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
function cleanupDuel(duelId) {
  const duel = activeDuels.get(duelId);
  if (!duel) return;
  userInDuel.delete(duel.challengerId);
  if (duel.opponentId && duel.opponentId !== 'BOT') userInDuel.delete(duel.opponentId);
  activeDuels.delete(duelId);
}

// ── Check if ready to battle ──────────────────────────────────────────────────
async function checkReady(duel) {
  if (duel.isBot) {
    if (duel.challengerFighter) {
      duel.status = 'battling';
      await runBotBattle(duel);
    }
    return;
  }
  if (duel.challengerFighter && duel.opponentFighter) {
    duel.status = 'battling';
    await runBattle(duel);
  }
}

// ── Public: start a PvP duel ──────────────────────────────────────────────────
async function startDuel(message, opponent) {
  const challengerId = message.author.id;
  const opponentId   = opponent.id;

  if (challengerId === opponentId) return message.reply("🤣 You can't duel yourself.");
  if (opponent.bot) return message.reply("🤖 Use `x!duel bot` to fight a bot opponent!");
  if (userInDuel.has(challengerId)) return message.reply("⚔️ You're already in a duel! Finish it first.");
  if (userInDuel.has(opponentId)) return message.reply(`⚔️ **${opponent.username}** is already in a duel right now.`);

  const [challengerHarem, opponentHarem] = await Promise.all([
    db.getHarem(challengerId),
    db.getHarem(opponentId),
  ]);

  if (!challengerHarem.length) return message.reply("💔 You need at least one character in your harem. Use `x!waifu` first.");
  if (!opponentHarem.length) return message.reply(`💔 **${opponent.username}** has no harem characters and can't duel.`);

  const duelId = genId();

  const inviteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`duel_accept_${duelId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`duel_decline_${duelId}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
  );

  const inviteEmbed = new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle('⚔️ Duel Challenge!')
    .setDescription(
      `**${message.author.username}** challenges you to a waifu duel!\n\n` +
      `• Pick a fighter from your harem\n` +
      `• Choose a combat stance (Aggressive / Defensive / Balanced / Berserker)\n` +
      `• The match auto-resolves — no per-turn inputs needed!\n\n` +
      `Winner earns 🌸 **Petals** scaled to the loser's character tier.`,
    )
    .setFooter({ text: 'You have 60 seconds to respond.' });

  let inviteDmMsg;
  try {
    inviteDmMsg = await (await opponent.createDM()).send({ embeds: [inviteEmbed], components: [inviteRow] });
  } catch {
    return message.reply(`❌ Couldn't DM **${opponent.username}**. They need DMs enabled from server members.`);
  }

  const duel = {
    id: duelId, channelId: message.channel.id,
    challengerId, opponentId,
    isBot: false,
    challengerHarem, opponentHarem,
    status: 'invite',
    challengerFighter: null, opponentFighter: null,
    pickedChar: { challenger: null, opponent: null },
    inviteDmMsg,
  };

  activeDuels.set(duelId, duel);
  userInDuel.set(challengerId, duelId);
  userInDuel.set(opponentId, duelId);

  await message.reply(`⚔️ <@${opponentId}>, **${message.author.username}** challenged you to a duel! Check your DMs.`);

  setTimeout(async () => {
    const d = activeDuels.get(duelId);
    if (d && d.status === 'invite') {
      cleanupDuel(duelId);
      inviteDmMsg.edit({ content: '⏰ Duel invite expired.', components: [] }).catch(() => {});
      const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
      if (ch) ch.send(`⏰ The duel between <@${challengerId}> and <@${opponentId}> expired.`).catch(() => {});
    }
  }, INVITE_TIMEOUT);
}

// ── Public: start a bot duel ──────────────────────────────────────────────────
async function startBotDuel(message) {
  const userId = message.author.id;

  if (userInDuel.has(userId)) return message.reply("⚔️ You're already in a duel! Finish it first.");

  const harem = await db.getHarem(userId);
  if (!harem.length) return message.reply("💔 You need at least one character in your harem. Use `x!waifu` first.");

  const botLevel = computeBotLevel(harem);
  const botTier  = bestTier(harem);
  const botRow   = await createBotRow(botLevel, botTier);
  const botStance = STANCES[Math.floor(Math.random() * STANCES.length)];
  const botFighter = createFighter('BOT', botRow, botStance);

  const duelId = genId();

  const duel = {
    id: duelId, channelId: message.channel.id,
    challengerId: userId, opponentId: 'BOT',
    isBot: true, botFighter,
    challengerHarem: harem,
    status: 'picking',
    challengerFighter: null,
    pickedChar: { challenger: null, opponent: null },
  };

  activeDuels.set(duelId, duel);
  userInDuel.set(userId, duelId);

  await message.reply(
    `${BOT_EMOJI} ${VS_EMOJI} **Bot Duel!** The bot picked **${botRow.character_name}** ` +
    `${TIER_EMOJI[botRow.tier]} ${LEVEL_EMOJI}Lv${botLevel} — now pick your fighter via DMs!`,
  );

  const ok = await sendCharacterPicker(userId, duelId, harem);
  if (!ok) {
    cleanupDuel(duelId);
    return message.channel.send(`❌ Couldn't DM <@${userId}> — enable DMs from server members.`).catch(() => {});
  }

  setTimeout(async () => {
    const d = activeDuels.get(duelId);
    if (d && d.status === 'picking') {
      cleanupDuel(duelId);
      const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
      if (ch) ch.send(`⏰ Bot duel expired — you didn't pick in time.`).catch(() => {});
    }
  }, PICK_TIMEOUT);
}

// ── Interaction handlers ──────────────────────────────────────────────────────
async function handleInteraction(interaction) {
  const id = interaction.customId;
  if (id.startsWith('duel_accept_'))  return handleAccept(interaction, id.slice('duel_accept_'.length));
  if (id.startsWith('duel_decline_')) return handleDecline(interaction, id.slice('duel_decline_'.length));
  if (id.startsWith('duel_pick_'))    return handlePick(interaction, id);
  if (id.startsWith('duel_stance_'))  return handleStance(interaction, id);
}

async function handleAccept(interaction, duelId) {
  const duel = activeDuels.get(duelId);
  if (!duel || duel.status !== 'invite') return interaction.update({ content: '⏰ This duel is no longer active.', components: [] }).catch(() => {});
  if (interaction.user.id !== duel.opponentId) return interaction.reply({ content: "This duel isn't for you.", ephemeral: true });

  duel.status = 'picking';
  await interaction.update({ content: '✅ Accepted! Sending you the character picker…', components: [], embeds: [] }).catch(() => {});

  const [okC, okO] = await Promise.all([
    sendCharacterPicker(duel.challengerId, duelId, duel.challengerHarem),
    sendCharacterPicker(duel.opponentId,   duelId, duel.opponentHarem),
  ]);

  if (!okC || !okO) {
    cleanupDuel(duelId);
    const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
    if (ch) ch.send(`❌ Duel cancelled — couldn't DM one of the players.`).catch(() => {});
    return;
  }

  setTimeout(async () => {
    const d = activeDuels.get(duelId);
    if (d && d.status === 'picking') {
      cleanupDuel(duelId);
      const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
      if (ch) ch.send(`⏰ Duel cancelled — character selection timed out.`).catch(() => {});
    }
  }, PICK_TIMEOUT);
}

async function handleDecline(interaction, duelId) {
  const duel = activeDuels.get(duelId);
  if (!duel) return interaction.update({ content: '⏰ Already gone.', components: [] }).catch(() => {});
  if (interaction.user.id !== duel.opponentId) return interaction.reply({ content: "Not for you.", ephemeral: true });

  cleanupDuel(duelId);
  await interaction.update({ content: '❌ Duel declined.', components: [], embeds: [] }).catch(() => {});
  const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
  if (ch) ch.send(`❌ <@${duel.opponentId}> declined the challenge from <@${duel.challengerId}>.`).catch(() => {});
}

async function handlePick(interaction, customId) {
  const parts  = customId.split('_');
  const duelId = parts[2];
  const userId = parts[3];
  const duel   = activeDuels.get(duelId);

  if (!duel || duel.status !== 'picking') return interaction.update({ content: '⏰ Selection expired.', components: [] }).catch(() => {});
  if (interaction.user.id !== userId) return interaction.reply({ content: "That's not for you.", ephemeral: true });

  const isChallenger = userId === duel.challengerId;
  const harem = isChallenger ? duel.challengerHarem : duel.opponentHarem;
  const idx   = parseInt(interaction.values[0], 10);
  const chosen = harem[idx];
  if (!chosen) return interaction.reply({ content: '⚠️ Invalid selection.', ephemeral: true });

  const tempFighter = createFighter(userId, chosen, 'Aggressive');
  if (isChallenger) duel.pickedChar.challenger = { row: chosen, fighter: tempFighter };
  else              duel.pickedChar.opponent   = { row: chosen, fighter: tempFighter };

  await interaction.update({ content: `✅ **${chosen.character_name}** selected! Now pick a stance:`, components: [], embeds: [] }).catch(() => {});
  await sendStancePicker(userId, duelId, tempFighter);
}

async function handleStance(interaction, customId) {
  const parts  = customId.split('_');
  const duelId = parts[2];
  const userId = parts[3];
  const stance = parts[4];
  const duel   = activeDuels.get(duelId);

  if (!duel || duel.status !== 'picking') return interaction.update({ content: '⏰ Setup expired.', components: [] }).catch(() => {});
  if (interaction.user.id !== userId) return interaction.reply({ content: "That's not for you.", ephemeral: true });

  const isChallenger = userId === duel.challengerId;
  const picked = isChallenger ? duel.pickedChar.challenger : duel.pickedChar.opponent;
  if (!picked) return interaction.reply({ content: '⚠️ Pick a character first.', ephemeral: true });

  const fighter = createFighter(userId, picked.row, stance);
  if (isChallenger) duel.challengerFighter = fighter;
  else              duel.opponentFighter   = fighter;

  const typeStr = `${TYPE_EMOJI[fighter.type]} ${fighter.type}`;
  await interaction.update({
    content: `✅ **${fighter.name}** (${typeStr}) ${LEVEL_EMOJI}Lv${fighter.level} with **${stance}** stance locked in! Waiting for opponent…`,
    components: [],
  }).catch(() => {});

  await checkReady(duel);
}

module.exports = { init, startDuel, startBotDuel, handleInteraction, isUserInDuel };
