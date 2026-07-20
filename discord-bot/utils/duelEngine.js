/**
 * duelEngine.js — x!duel 1v1 handler (rewritten)
 * ─────────────────────────────────────────────────────────────────────────────
 * New flow vs old:
 *   OLD: per-turn DM buttons (slow, requires both players to respond each turn)
 *   NEW: pick character + stance ONCE up front, then resolveDuel() auto-plays
 *        the whole match and posts an animated turn-by-turn sequence (~1.5s/turn)
 *
 * Interaction customIds routed from index.js:
 *   duel_accept_<id>
 *   duel_decline_<id>
 *   duel_pick_<id>_<userId>        (StringSelectMenu)
 *   duel_stance_<id>_<userId>_<stance>  (Button)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, EmbedBuilder, AttachmentBuilder,
} = require('discord.js');

const db     = require('./db.js');
const engine = require('./battleEngine.js');
const { drawBattleFrame } = require('./battleCanvas.js');

const { TYPE_EMOJI, TIER_EMOJI, TIER_REWARD_MULT, createFighter, resolveDuel } = engine;

const BASE_REWARD      = 50;
const CONSOLATION      = 10;
const INVITE_TIMEOUT   = 60_000;
const PICK_TIMEOUT     = 90_000;
const TURN_ANIM_MS     = 1_500; // delay between animated turns

const activeDuels = new Map(); // duelId → state
const userInDuel  = new Map(); // userId → duelId

let _client = null;
function init(client) { _client = client; }
function isUserInDuel(userId) { return userInDuel.has(userId); }

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Stance selection buttons ──────────────────────────────────────────────────
const STANCES = ['Aggressive', 'Defensive', 'Balanced', 'Berserker'];
const STANCE_DESC = {
  Aggressive: '⚔️ Always attacks — maximum pressure.',
  Defensive:  '🛡️ Defends until energy full, then Special.',
  Balanced:   '⚖️ Repeats winning moves, switches on loss.',
  Berserker:  '💢 Always attacks with ATK rising as HP drops.',
};

function buildStanceRow(duelId, userId) {
  const rows = [];
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  row1.addComponents(
    new ButtonBuilder().setCustomId(`duel_stance_${duelId}_${userId}_Aggressive`).setLabel('⚔️ Aggressive').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`duel_stance_${duelId}_${userId}_Defensive`).setLabel('🛡️ Defensive').setStyle(ButtonStyle.Primary),
  );
  row2.addComponents(
    new ButtonBuilder().setCustomId(`duel_stance_${duelId}_${userId}_Balanced`).setLabel('⚖️ Balanced').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`duel_stance_${duelId}_${userId}_Berserker`).setLabel('💢 Berserker').setStyle(ButtonStyle.Success),
  );
  return [row1, row2];
}

// ── Character picker DM ───────────────────────────────────────────────────────
async function sendCharacterPicker(userId, duelId, harem) {
  const user = await _client.users.fetch(userId).catch(() => null);
  if (!user) return false;

  const options = harem.slice(0, 25).map((row, i) => {
    const type = engine.getType(row.character_id);
    return {
      label: `${i + 1}. ${row.character_name}`.slice(0, 100),
      description: `${TIER_EMOJI[row.tier]} ${row.tier} | ${TYPE_EMOJI[type]} ${type}`.slice(0, 100),
      value: String(i),
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
      'After picking, you\'ll choose a **combat stance** that drives every decision.\n\n' +
      'Characters are listed by tier (Legendary first).',
    )
    .setFooter({ text: 'You have 90 seconds to choose.' });

  try {
    await user.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    return true;
  } catch {
    return false;
  }
}

// ── Stance picker DM ──────────────────────────────────────────────────────────
async function sendStancePicker(userId, duelId, fighter) {
  const user = await _client.users.fetch(userId).catch(() => null);
  if (!user) return;

  const embed = new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle('⚔️ Step 2 — Choose Your Stance')
    .setDescription(
      `**Fighter:** ${TIER_EMOJI[fighter.tier]} ${fighter.name} ` +
      `(${TYPE_EMOJI[fighter.type]} ${fighter.type})\n` +
      `**HP:** ${fighter.maxHp} | **ATK:** ${fighter.atk}\n\n` +
      Object.entries(STANCE_DESC).map(([k, v]) => `**${k}** — ${v}`).join('\n'),
    )
    .setFooter({ text: 'Stance drives every move. Choose wisely!' });

  await user.send({ embeds: [embed], components: buildStanceRow(duelId, userId) }).catch(() => {});
}

// ── Animate the resolved battle ───────────────────────────────────────────────
async function animateBattle(duel, fighterA, fighterB, log, channelId) {
  const channel = await _client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  // Snapshot fighters for rendering without mutating
  const snapA = { ...fighterA, currentHp: fighterA.maxHp, energy: 0 };
  const snapB = { ...fighterB, currentHp: fighterB.maxHp, energy: 0 };

  // Post opening frame
  let battleMsg;
  try {
    const buf = await drawBattleFrame({ fighterA: snapA, fighterB: snapB, turn: 0, lastResult: '⚔️ Battle begins!', ended: false });
    battleMsg = await channel.send({ files: [new AttachmentBuilder(buf, { name: 'battle.png' })] });
  } catch (err) {
    console.error('[duel] failed to post opening frame:', err.message);
    return;
  }

  // Animate each turn with a delay
  for (const entry of log) {
    await sleep(TURN_ANIM_MS);
    snapA.currentHp = entry.hpA;
    snapA.energy    = entry.energyA;
    snapB.currentHp = entry.hpB;
    snapB.energy    = entry.energyB;

    const caption = entry.typeNote ? `${entry.description} ${entry.typeNote}` : entry.description;
    try {
      const buf = await drawBattleFrame({ fighterA: snapA, fighterB: snapB, turn: entry.turn, lastResult: caption, ended: false });
      await battleMsg.edit({ files: [new AttachmentBuilder(buf, { name: 'battle.png' })] });
    } catch {}
  }

  return battleMsg;
}

// ── Run the full battle and post results ──────────────────────────────────────
async function runBattle(duel) {
  const fA = duel.challengerFighter;
  const fB = duel.opponentFighter;

  const channel = await _client.channels.fetch(duel.channelId).catch(() => null);
  if (channel) {
    const startEmbed = new EmbedBuilder()
      .setColor(0xa855f7)
      .setTitle('⚔️ The Battle Begins!')
      .setDescription(
        `<@${duel.challengerId}> sends **${fA.name}** ${TIER_EMOJI[fA.tier]} ${TYPE_EMOJI[fA.type]} *(${fA.stance})*\n` +
        `<@${duel.opponentId}> sends **${fB.name}** ${TIER_EMOJI[fB.tier]} ${TYPE_EMOJI[fB.type]} *(${fB.stance})*\n\n` +
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

  // Final "battle over" frame
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

  // Pay out
  const mult   = TIER_REWARD_MULT[loserFtr.tier] ?? 1;
  const payout = Math.round(BASE_REWARD * mult);

  await Promise.all([
    db.addBalance(winnerId, payout).catch(() => {}),
    db.addBalance(loserId, CONSOLATION).catch(() => {}),
    db.logDuel(winnerId, loserId, winnerFtr.name, loserFtr.name, log.length, payout).catch(() => {}),
  ]);

  // Result embed
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
        `🌸 **${loserUser?.username ?? 'Loser'}** gets **${CONSOLATION} Petals** consolation.`,
      )
      .addFields(
        { name: 'Turns', value: `${log.length}`, inline: true },
        { name: 'Winning stance', value: winnerFtr.stance, inline: true },
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
  userInDuel.delete(duel.opponentId);
  activeDuels.delete(duelId);
}

// ── Check if both players are ready ──────────────────────────────────────────
async function checkReady(duel) {
  if (duel.challengerFighter && duel.opponentFighter) {
    duel.status = 'battling';
    await runBattle(duel);
  }
}

// ── Public: start a duel ──────────────────────────────────────────────────────
async function startDuel(message, opponent) {
  const challengerId = message.author.id;
  const opponentId   = opponent.id;

  if (challengerId === opponentId) return message.reply("🤣 You can't duel yourself.");
  if (opponent.bot) return message.reply("🤖 You can't duel a bot.");
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

  // Auto-expire invite
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

// ── Interaction handlers ──────────────────────────────────────────────────────
async function handleInteraction(interaction) {
  const id = interaction.customId;
  if (id.startsWith('duel_accept_'))   return handleAccept(interaction, id.slice('duel_accept_'.length));
  if (id.startsWith('duel_decline_'))  return handleDecline(interaction, id.slice('duel_decline_'.length));
  if (id.startsWith('duel_pick_'))     return handlePick(interaction, id);
  if (id.startsWith('duel_stance_'))   return handleStance(interaction, id);
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

  // Auto-cancel if picking takes too long
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
  // duel_pick_<duelId>_<userId>
  const parts  = customId.split('_');
  const duelId = parts[2];
  const userId = parts[3];
  const duel   = activeDuels.get(duelId);

  if (!duel || duel.status !== 'picking') return interaction.update({ content: '⏰ Selection expired.', components: [] }).catch(() => {});
  if (interaction.user.id !== userId) return interaction.reply({ content: "That's not for you.", ephemeral: true });

  const isChallenger = userId === duel.challengerId;
  const harem = isChallenger ? duel.challengerHarem : duel.opponentHarem;
  const idx = parseInt(interaction.values[0], 10);
  const chosen = harem[idx];
  if (!chosen) return interaction.reply({ content: '⚠️ Invalid selection.', ephemeral: true });

  // Build fighter (no stance yet — set when stance is chosen)
  const tempFighter = createFighter(userId, chosen, 'Aggressive'); // placeholder stance
  if (isChallenger) duel.pickedChar.challenger = { row: chosen, fighter: tempFighter };
  else              duel.pickedChar.opponent   = { row: chosen, fighter: tempFighter };

  await interaction.update({ content: `✅ **${chosen.character_name}** selected! Now pick a stance:`, components: [], embeds: [] }).catch(() => {});
  await sendStancePicker(userId, duelId, tempFighter);
}

async function handleStance(interaction, customId) {
  // duel_stance_<duelId>_<userId>_<Stance>
  const parts  = customId.split('_');
  // parts: ['duel','stance',duelId,userId,StanceName]
  const duelId = parts[2];
  const userId = parts[3];
  const stance = parts[4];
  const duel   = activeDuels.get(duelId);

  if (!duel || duel.status !== 'picking') return interaction.update({ content: '⏰ Setup expired.', components: [] }).catch(() => {});
  if (interaction.user.id !== userId) return interaction.reply({ content: "That's not for you.", ephemeral: true });

  const isChallenger = userId === duel.challengerId;
  const picked = isChallenger ? duel.pickedChar.challenger : duel.pickedChar.opponent;
  if (!picked) return interaction.reply({ content: '⚠️ Pick a character first.', ephemeral: true });

  // Build final fighter with chosen stance
  const fighter = createFighter(userId, picked.row, stance);
  if (isChallenger) duel.challengerFighter = fighter;
  else              duel.opponentFighter   = fighter;

  const typeStr = `${TYPE_EMOJI[fighter.type]} ${fighter.type}`;
  await interaction.update({
    content: `✅ **${fighter.name}** (${typeStr}) with **${stance}** stance locked in! Waiting for opponent…`,
    components: [],
  }).catch(() => {});

  await checkReady(duel);
}

module.exports = { init, startDuel, handleInteraction, isUserInDuel };
