/**
 * duelEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages active waifu duels end-to-end.
 *   • State lives in-memory (activeDuels / userInDuel Maps)
 *   • Handles: invite → character pick → turn loop → resolution → cleanup
 *   • Entry points:
 *       startDuel(message, opponent)      — called from duel.js command
 *       handleInteraction(interaction)    — called from index.js interactionCreate
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const db = require('./db.js');
const { drawBattleFrame } = require('./battleCanvas.js');

// ── Constants ─────────────────────────────────────────────────────────────
const TIER_STATS = {
  Legendary: { hp: 250, atk: 65 },
  Epic:      { hp: 200, atk: 48 },
  Rare:      { hp: 160, atk: 36 },
  Uncommon:  { hp: 130, atk: 28 },
  Common:    { hp: 100, atk: 20 },
};

const TIER_REWARD_MULT = {
  Legendary: 2.5,
  Epic:      2.0,
  Rare:      1.6,
  Uncommon:  1.3,
  Common:    1.0,
};

const BASE_REWARD       = 50;
const CONSOLATION       = 10;
const ENERGY_MAX        = 3;
const MAX_TURNS         = 15;
const TURN_TIMEOUT_MS   = 60_000;
const INVITE_TIMEOUT_MS = 60_000;
const PICK_TIMEOUT_MS   = 60_000;
const AUTO_FORFEIT_AFTER = 2; // consecutive timeouts before auto-forfeit

const TIER_EMOJI = {
  Legendary: '🌟', Epic: '💎', Rare: '🔥', Uncommon: '✨', Common: '⚪',
};

// ── State ─────────────────────────────────────────────────────────────────
const activeDuels = new Map(); // duelId → duelState
const userInDuel  = new Map(); // userId → duelId

// Stored at init time
let _client = null;
function init(client) { _client = client; }

// ── Helpers ───────────────────────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function isUserInDuel(userId) {
  return userInDuel.has(userId);
}

function createFighter(userId, haremRow) {
  const stats = TIER_STATS[haremRow.tier] || TIER_STATS.Common;
  return {
    userId,
    name:     haremRow.character_name,
    tier:     haremRow.tier,
    imageUrl: haremRow.image_url,
    haremId:  haremRow.id,
    maxHp:    stats.hp,
    currentHp: stats.hp,
    atk:      stats.atk,
    energy:   0,
    consecutiveTimeouts: 0,
  };
}

/**
 * Resolve a pair of simultaneous moves.
 * Returns: { dmgToA, dmgToB, energyDeltaA, energyDeltaB, description }
 */
function resolveMoves(moveA, moveB, fA, fB) {
  // Special beats everything (if both use Special, both fire)
  if (moveA === 'special' && moveB === 'special') {
    return {
      dmgToA: Math.round(fB.atk * 1.5),
      dmgToB: Math.round(fA.atk * 1.5),
      energyDeltaA: -fA.energy,
      energyDeltaB: -fB.energy,
      description: `💥 Both unleashed their Specials!`,
    };
  }
  if (moveA === 'special') {
    return {
      dmgToA: 0,
      dmgToB: Math.round(fA.atk * 1.5),
      energyDeltaA: -fA.energy,
      energyDeltaB: 0,
      description: `✨ ${fA.name} unleashed a Special — ${fB.name}'s move was ignored!`,
    };
  }
  if (moveB === 'special') {
    return {
      dmgToA: Math.round(fB.atk * 1.5),
      dmgToB: 0,
      energyDeltaA: 0,
      energyDeltaB: -fB.energy,
      description: `✨ ${fB.name} unleashed a Special — ${fA.name}'s move was ignored!`,
    };
  }

  // Attack vs Attack
  if (moveA === 'attack' && moveB === 'attack') {
    return {
      dmgToA: fB.atk,
      dmgToB: fA.atk,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `⚔️ Both attacked! ${fA.name} hits for ${fA.atk}, ${fB.name} hits for ${fB.atk}.`,
    };
  }

  // Defend vs Defend
  if (moveA === 'defend' && moveB === 'defend') {
    return {
      dmgToA: 0, dmgToB: 0,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `🛡️ Both defended — nothing happened!`,
    };
  }

  // Charge vs Charge
  if (moveA === 'charge' && moveB === 'charge') {
    return {
      dmgToA: 0, dmgToB: 0,
      energyDeltaA: 1, energyDeltaB: 1,
      description: `⚡ Both charged up energy!`,
    };
  }

  // Attack vs Defend → attacker hits 30%, defender reflects 20%
  if (moveA === 'attack' && moveB === 'defend') {
    const taken = Math.round(fA.atk * 0.3);
    const reflect = Math.round(fB.atk * 0.2);
    return {
      dmgToA: reflect, dmgToB: taken,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `🛡️ ${fB.name} defended! Absorbed most of the blow and reflected ${reflect} dmg back.`,
    };
  }
  if (moveA === 'defend' && moveB === 'attack') {
    const taken = Math.round(fB.atk * 0.3);
    const reflect = Math.round(fA.atk * 0.2);
    return {
      dmgToA: taken, dmgToB: reflect,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `🛡️ ${fA.name} defended! Absorbed most of the blow and reflected ${reflect} dmg back.`,
    };
  }

  // Attack vs Charge → attacker hits full, charger interrupted (no energy gain)
  if (moveA === 'attack' && moveB === 'charge') {
    return {
      dmgToA: 0, dmgToB: fA.atk,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `⚔️ ${fA.name} attacked ${fB.name} mid-charge for full ${fA.atk} damage!`,
    };
  }
  if (moveA === 'charge' && moveB === 'attack') {
    return {
      dmgToA: fB.atk, dmgToB: 0,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `⚔️ ${fB.name} attacked ${fA.name} mid-charge for full ${fB.atk} damage!`,
    };
  }

  // Charge vs Defend → charger gains energy safely
  if (moveA === 'charge' && moveB === 'defend') {
    return {
      dmgToA: 0, dmgToB: 0,
      energyDeltaA: 1, energyDeltaB: 0,
      description: `⚡ ${fA.name} charged safely behind ${fB.name}'s defend.`,
    };
  }
  if (moveA === 'defend' && moveB === 'charge') {
    return {
      dmgToA: 0, dmgToB: 0,
      energyDeltaA: 0, energyDeltaB: 1,
      description: `⚡ ${fB.name} charged safely behind ${fA.name}'s defend.`,
    };
  }

  // Defend vs Charge (same as above, covered)
  return {
    dmgToA: 0, dmgToB: 0,
    energyDeltaA: 0, energyDeltaB: 0,
    description: `Both did something. Nothing to show.`,
  };
}

// ── Duel cleanup ──────────────────────────────────────────────────────────
function cleanupDuel(duelId) {
  const duel = activeDuels.get(duelId);
  if (!duel) return;
  if (duel.turnTimerHandle) clearTimeout(duel.turnTimerHandle);
  userInDuel.delete(duel.challengerId);
  userInDuel.delete(duel.opponentId);
  activeDuels.delete(duelId);
}

// ── Build move buttons ────────────────────────────────────────────────────
function buildMoveRow(duelId, userId, energy) {
  const canSpecial = energy >= ENERGY_MAX;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`duel_move_${duelId}_${userId}_attack`)
      .setLabel('⚔️ Attack')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`duel_move_${duelId}_${userId}_defend`)
      .setLabel('🛡️ Defend')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`duel_move_${duelId}_${userId}_charge`)
      .setLabel('⚡ Charge')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`duel_move_${duelId}_${userId}_special`)
      .setLabel('✨ Special')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canSpecial),
  );
}

// ── Post battle frame to channel ──────────────────────────────────────────
async function postBattleFrame(duel, lastResult, ended = false, winnerName = null) {
  try {
    const buf = await drawBattleFrame({
      fighterA:  duel.challengerFighter,
      fighterB:  duel.opponentFighter,
      turn:      duel.turn,
      lastResult,
      ended,
      winnerName,
    });

    const attachment = new AttachmentBuilder(buf, { name: 'battle.png' });
    const channel = await _client.channels.fetch(duel.channelId).catch(() => null);
    if (!channel) return;

    if (duel.battleMessageId) {
      // Edit the existing battle message if possible, else send a new one
      const old = await channel.messages.fetch(duel.battleMessageId).catch(() => null);
      if (old) {
        await old.edit({ files: [attachment] }).catch(() => {});
        return;
      }
    }

    const msg = await channel.send({ files: [attachment] });
    duel.battleMessageId = msg.id;
  } catch (err) {
    console.error('[duel] postBattleFrame error:', err.message);
  }
}

// ── DM a player their turn prompt ────────────────────────────────────────
async function sendTurnPrompt(duel, fighter) {
  const opponent = fighter.userId === duel.challengerId
    ? duel.opponentFighter
    : duel.challengerFighter;

  try {
    const user = await _client.users.fetch(fighter.userId);
    const row  = buildMoveRow(duel.id, fighter.userId, fighter.energy);
    const embed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle(`⚔️ Turn ${duel.turn} — Choose your move`)
      .setDescription(
        `**Your fighter:** ${TIER_EMOJI[fighter.tier]} ${fighter.name} (${fighter.currentHp}/${fighter.maxHp} HP)\n` +
        `**Opponent:** ${TIER_EMOJI[opponent.tier]} ${opponent.name} (${opponent.currentHp}/${opponent.maxHp} HP)\n\n` +
        `⚡ Energy: ${'🟡'.repeat(fighter.energy)}${'⚫'.repeat(ENERGY_MAX - fighter.energy)} ${fighter.energy}/${ENERGY_MAX}\n\n` +
        `You have **60 seconds** — no reply = auto Charge.`,
      )
      .setFooter({ text: `Turn ${duel.turn} of ${MAX_TURNS} max` });

    await user.send({ embeds: [embed], components: [row] });
  } catch {
    // DMs blocked after initial invite — treat as auto-Charge
    recordMove(duel, fighter.userId, 'charge', true);
  }
}

// ── Record a move for this turn ───────────────────────────────────────────
async function recordMove(duel, userId, move, wasTimeout = false) {
  const isChallenger = userId === duel.challengerId;
  const fighter = isChallenger ? duel.challengerFighter : duel.opponentFighter;

  if (isChallenger) {
    if (duel.pendingMoves.challenger !== null) return; // already recorded
    duel.pendingMoves.challenger = move;
  } else {
    if (duel.pendingMoves.opponent !== null) return;
    duel.pendingMoves.opponent = move;
  }

  if (wasTimeout) {
    fighter.consecutiveTimeouts++;
  } else {
    fighter.consecutiveTimeouts = 0;
  }

  // Auto-forfeit check (2 consecutive timeouts)
  if (fighter.consecutiveTimeouts >= AUTO_FORFEIT_AFTER) {
    await endDuel(duel, isChallenger ? duel.opponentId : duel.challengerId, 'forfeit (AFK)');
    return;
  }

  // If both moves are in, resolve the turn
  if (duel.pendingMoves.challenger !== null && duel.pendingMoves.opponent !== null) {
    if (duel.turnTimerHandle) clearTimeout(duel.turnTimerHandle);
    await resolveTurn(duel);
  }
}

// ── Start a turn ─────────────────────────────────────────────────────────
async function startTurn(duel) {
  duel.pendingMoves = { challenger: null, opponent: null };

  // Send turn prompts to both players in parallel
  await Promise.all([
    sendTurnPrompt(duel, duel.challengerFighter),
    sendTurnPrompt(duel, duel.opponentFighter),
  ]);

  // 60s auto-charge timer
  duel.turnTimerHandle = setTimeout(async () => {
    const { challenger, opponent } = duel.pendingMoves;
    if (challenger === null) await recordMove(duel, duel.challengerId, 'charge', true);
    if (opponent === null)   await recordMove(duel, duel.opponentId,  'charge', true);
  }, TURN_TIMEOUT_MS);
}

// ── Resolve the current turn ──────────────────────────────────────────────
async function resolveTurn(duel) {
  const fA = duel.challengerFighter;
  const fB = duel.opponentFighter;
  const { challenger: moveA, opponent: moveB } = duel.pendingMoves;

  const result = resolveMoves(moveA, moveB, fA, fB);

  // Apply damage
  fA.currentHp = Math.max(0, fA.currentHp - result.dmgToA);
  fB.currentHp = Math.max(0, fB.currentHp - result.dmgToB);

  // Apply energy deltas (clamped 0–ENERGY_MAX)
  fA.energy = Math.max(0, Math.min(ENERGY_MAX, fA.energy + result.energyDeltaA));
  fB.energy = Math.max(0, Math.min(ENERGY_MAX, fB.energy + result.energyDeltaB));

  // Post updated frame
  await postBattleFrame(duel, result.description);

  // Win check
  const aKO = fA.currentHp <= 0;
  const bKO = fB.currentHp <= 0;

  if (aKO || bKO) {
    if (aKO && bKO) {
      // Simultaneous KO → higher HP% wins (both are 0 here, so check ATK tiebreak)
      const winner = fA.atk >= fB.atk ? duel.challengerId : duel.opponentId;
      await endDuel(duel, winner, 'simultaneous KO — ATK tiebreak');
    } else {
      const winner = aKO ? duel.opponentId : duel.challengerId;
      await endDuel(duel, winner, 'KO');
    }
    return;
  }

  // Turn cap check
  if (duel.turn >= MAX_TURNS) {
    const hpPctA = fA.currentHp / fA.maxHp;
    const hpPctB = fB.currentHp / fB.maxHp;
    let winner;
    if (Math.abs(hpPctA - hpPctB) < 0.001) {
      // True tie → ATK tiebreak
      winner = fA.atk >= fB.atk ? duel.challengerId : duel.opponentId;
    } else {
      winner = hpPctA > hpPctB ? duel.challengerId : duel.opponentId;
    }
    await endDuel(duel, winner, 'turn cap reached');
    return;
  }

  duel.turn++;
  await startTurn(duel);
}

// ── End the duel ──────────────────────────────────────────────────────────
async function endDuel(duel, winnerId, reason) {
  const loserId      = winnerId === duel.challengerId ? duel.opponentId : duel.challengerId;
  const winnerFighter = winnerId === duel.challengerId ? duel.challengerFighter : duel.opponentFighter;
  const loserFighter  = loserId  === duel.challengerId ? duel.challengerFighter : duel.opponentFighter;

  // Payout
  const mult   = TIER_REWARD_MULT[loserFighter.tier] ?? 1;
  const payout = Math.round(BASE_REWARD * mult);

  await Promise.all([
    db.addBalance(winnerId, payout).catch(() => {}),
    db.addBalance(loserId, CONSOLATION).catch(() => {}),
    db.logDuel(winnerId, loserId, winnerFighter.name, loserFighter.name, duel.turn, payout).catch(() => {}),
  ]);

  // Final frame
  const channel = await _client.channels.fetch(duel.channelId).catch(() => null);
  const winnerUser = await _client.users.fetch(winnerId).catch(() => null);
  const loserUser  = await _client.users.fetch(loserId).catch(() => null);

  await postBattleFrame(duel, `Battle ended — ${reason}`, true, winnerUser?.username ?? 'Unknown');

  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 Duel Over!')
      .setDescription(
        `**Winner:** <@${winnerId}> with ${TIER_EMOJI[winnerFighter.tier]} **${winnerFighter.name}**\n` +
        `**Loser:** <@${loserId}> with ${TIER_EMOJI[loserFighter.tier]} **${loserFighter.name}**\n\n` +
        `🌸 **${winnerUser?.username ?? 'Winner'}** earned **${payout} Petals**!\n` +
        `🌸 **${loserUser?.username ?? 'Loser'}** gets **${CONSOLATION} Petals** consolation.`,
      )
      .setFooter({ text: `Ended: ${reason}` });
    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  cleanupDuel(duel.id);
}

// ── Character picker DM ───────────────────────────────────────────────────
async function sendCharacterPicker(userId, duelId, harem) {
  const user = await _client.users.fetch(userId).catch(() => null);
  if (!user) return false;

  const options = harem.slice(0, 25).map((row, i) => ({
    label: `${i + 1}. ${row.character_name}`.slice(0, 100),
    description: `${TIER_EMOJI[row.tier] ?? ''} ${row.tier} — ${row.source_title ?? 'Unknown'}`.slice(0, 100),
    value: String(i),
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`duel_pick_${duelId}_${userId}`)
    .setPlaceholder('Pick your fighter…')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);
  const embed = new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle('⚔️ Pick Your Fighter')
    .setDescription('Choose which character will represent you in the duel.')
    .setFooter({ text: 'You have 60 seconds to choose' });

  try {
    await user.send({ embeds: [embed], components: [row] });
    return true;
  } catch {
    return false;
  }
}

// ── Public API: start a duel ──────────────────────────────────────────────
async function startDuel(message, opponent) {
  const challengerId = message.author.id;
  const opponentId   = opponent.id;

  if (challengerId === opponentId) {
    return message.reply("🤣 You can't duel yourself.");
  }
  if (userInDuel.has(challengerId)) {
    return message.reply("⚔️ You're already in a duel! Finish it first.");
  }
  if (userInDuel.has(opponentId)) {
    return message.reply(`⚔️ **${opponent.username}** is already in a duel right now.`);
  }
  if (opponent.bot) {
    return message.reply("🤖 You can't duel a bot.");
  }

  const [challengerHarem, opponentHarem] = await Promise.all([
    db.getHarem(challengerId),
    db.getHarem(opponentId),
  ]);

  if (!challengerHarem.length) {
    return message.reply("💔 You need at least one character in your harem to duel. Use `x!waifu` first.");
  }
  if (!opponentHarem.length) {
    return message.reply(`💔 **${opponent.username}** has no characters in their harem and can't accept duels yet.`);
  }

  const duelId = genId();

  // Try to DM the opponent
  const inviteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`duel_accept_${duelId}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`duel_decline_${duelId}`)
      .setLabel('❌ Decline')
      .setStyle(ButtonStyle.Danger),
  );

  const inviteEmbed = new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle('⚔️ Duel Challenge!')
    .setDescription(
      `**${message.author.username}** has challenged you to a waifu battle!\n\n` +
      `Both of you will pick a fighter from your harems, then fight turn-by-turn.\n` +
      `Winner earns **Petals** 🌸 based on your character's tier.`,
    )
    .setFooter({ text: 'You have 60 seconds to respond' });

  let inviteDmMsg;
  try {
    const dm = await opponent.createDM();
    inviteDmMsg = await dm.send({ embeds: [inviteEmbed], components: [inviteRow] });
  } catch {
    return message.reply(
      `❌ Couldn't DM **${opponent.username}**. They need to enable **DMs from server members** in their Privacy Settings.`,
    );
  }

  // Register duel state
  const duel = {
    id:              duelId,
    channelId:       message.channel.id,
    guildId:         message.guild?.id,
    challengerId,
    opponentId,
    challengerHarem,
    opponentHarem,
    status:          'invite',
    challengerFighter: null,
    opponentFighter:   null,
    pickedCount:       0,
    pendingMoves:      { challenger: null, opponent: null },
    turn:              1,
    turnTimerHandle:   null,
    battleMessageId:   null,
    inviteDmMsg,
  };

  activeDuels.set(duelId, duel);
  userInDuel.set(challengerId, duelId);
  userInDuel.set(opponentId, duelId);

  await message.reply(
    `⚔️ <@${opponentId}>, **${message.author.username}** has challenged you to a duel! Check your DMs.`,
  );

  // Auto-cancel invite after 60s
  setTimeout(async () => {
    const d = activeDuels.get(duelId);
    if (d && d.status === 'invite') {
      cleanupDuel(duelId);
      try {
        await inviteDmMsg.edit({ content: '⏰ Duel invite expired.', components: [] });
      } catch {}
      const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
      if (ch) ch.send(`⏰ The duel between <@${challengerId}> and <@${opponentId}> expired — no response.`).catch(() => {});
    }
  }, INVITE_TIMEOUT_MS);
}

// ── Public API: handle any duel-related interaction ───────────────────────
async function handleInteraction(interaction) {
  const id = interaction.customId;

  if (id.startsWith('duel_accept_')) {
    await handleAccept(interaction, id.replace('duel_accept_', ''));
  } else if (id.startsWith('duel_decline_')) {
    await handleDecline(interaction, id.replace('duel_decline_', ''));
  } else if (id.startsWith('duel_pick_')) {
    await handlePick(interaction, id);
  } else if (id.startsWith('duel_move_')) {
    await handleMove(interaction, id);
  }
}

async function handleAccept(interaction, duelId) {
  const duel = activeDuels.get(duelId);
  if (!duel || duel.status !== 'invite') {
    return interaction.update({ content: '⏰ This duel is no longer active.', components: [] }).catch(() => {});
  }
  if (interaction.user.id !== duel.opponentId) {
    return interaction.reply({ content: "This duel isn't for you.", ephemeral: true }).catch(() => {});
  }

  duel.status = 'picking';
  await interaction.update({ content: '✅ Duel accepted! Now pick your fighter.', components: [], embeds: [] }).catch(() => {});

  // Send character pickers to both
  const [okChallenger, okOpponent] = await Promise.all([
    sendCharacterPicker(duel.challengerId, duelId, duel.challengerHarem),
    sendCharacterPicker(duel.opponentId,   duelId, duel.opponentHarem),
  ]);

  // Auto-cancel if pick times out
  setTimeout(async () => {
    const d = activeDuels.get(duelId);
    if (d && d.status === 'picking') {
      cleanupDuel(duelId);
      const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
      if (ch) ch.send(`⏰ Duel cancelled — one or both players didn't pick a fighter in time.`).catch(() => {});
    }
  }, PICK_TIMEOUT_MS);
}

async function handleDecline(interaction, duelId) {
  const duel = activeDuels.get(duelId);
  if (!duel) {
    return interaction.update({ content: '⏰ Duel already gone.', components: [] }).catch(() => {});
  }
  if (interaction.user.id !== duel.opponentId) {
    return interaction.reply({ content: "This duel isn't for you.", ephemeral: true }).catch(() => {});
  }

  cleanupDuel(duelId);
  await interaction.update({ content: '❌ You declined the duel.', components: [], embeds: [] }).catch(() => {});

  const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
  if (ch) {
    ch.send(`❌ <@${duel.opponentId}> declined the duel challenge from <@${duel.challengerId}>.`).catch(() => {});
  }
}

async function handlePick(interaction, customId) {
  // customId format: duel_pick_<duelId>_<userId>
  const parts  = customId.split('_');
  const duelId = parts[2];
  const userId = parts[3];
  const duel   = activeDuels.get(duelId);

  if (!duel || duel.status !== 'picking') {
    return interaction.update({ content: '⏰ Character selection timed out.', components: [] }).catch(() => {});
  }
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "That selection isn't yours.", ephemeral: true }).catch(() => {});
  }

  const haremIndex = parseInt(interaction.values[0], 10);
  const isChallenger = userId === duel.challengerId;
  const harem = isChallenger ? duel.challengerHarem : duel.opponentHarem;
  const chosen = harem[haremIndex];

  if (!chosen) {
    return interaction.reply({ content: '⚠️ Invalid selection.', ephemeral: true }).catch(() => {});
  }

  const fighter = createFighter(userId, chosen);
  if (isChallenger) {
    duel.challengerFighter = fighter;
  } else {
    duel.opponentFighter = fighter;
  }

  duel.pickedCount++;
  await interaction.update({
    content: `✅ You chose **${chosen.character_name}** (${TIER_EMOJI[chosen.tier]} ${chosen.tier})! Waiting for opponent…`,
    components: [],
    embeds: [],
  }).catch(() => {});

  // Both picked — start the battle
  if (duel.pickedCount === 2) {
    duel.status = 'battling';

    const ch = await _client.channels.fetch(duel.channelId).catch(() => null);
    if (ch) {
      const embed = new EmbedBuilder()
        .setColor(0xa855f7)
        .setTitle('⚔️ The Battle Begins!')
        .setDescription(
          `<@${duel.challengerId}> fields **${duel.challengerFighter.name}** ${TIER_EMOJI[duel.challengerFighter.tier]}\n` +
          `<@${duel.opponentId}> fields **${duel.opponentFighter.name}** ${TIER_EMOJI[duel.opponentFighter.tier]}\n\n` +
          `Check your DMs each turn to choose a move. The battle image will update here!`,
        );
      await ch.send({ embeds: [embed] }).catch(() => {});
    }

    // Post initial frame
    await postBattleFrame(duel, 'Battle started! Turn 1 underway.', false, null);
    await startTurn(duel);
  }
}

async function handleMove(interaction, customId) {
  // customId format: duel_move_<duelId>_<userId>_<move>
  const parts  = customId.split('_');
  const duelId = parts[2];
  const userId = parts[3];
  const move   = parts[4]; // attack | defend | charge | special

  const duel = activeDuels.get(duelId);
  if (!duel || duel.status !== 'battling') {
    return interaction.update({ content: '⏰ This turn is no longer active.', components: [] }).catch(() => {});
  }
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: "That button isn't yours.", ephemeral: true }).catch(() => {});
  }

  // Validate special
  const fighter = userId === duel.challengerId ? duel.challengerFighter : duel.opponentFighter;
  if (move === 'special' && fighter.energy < ENERGY_MAX) {
    return interaction.reply({ content: '⚡ Not enough energy for Special yet!', ephemeral: true }).catch(() => {});
  }

  const alreadyMoved = userId === duel.challengerId
    ? duel.pendingMoves.challenger !== null
    : duel.pendingMoves.opponent !== null;

  if (alreadyMoved) {
    return interaction.update({ content: `✅ Move locked in: **${move}**. Waiting for opponent…`, components: [] }).catch(() => {});
  }

  const moveLabel = { attack: '⚔️ Attack', defend: '🛡️ Defend', charge: '⚡ Charge', special: '✨ Special' }[move];
  await interaction.update({ content: `✅ Move locked in: **${moveLabel}**. Waiting for opponent…`, components: [] }).catch(() => {});

  await recordMove(duel, userId, move, false);
}

module.exports = { init, startDuel, handleInteraction, isUserInDuel };
