/**
 * warfareEngine.js — x!warfare 3v3 gauntlet handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Reuses battleEngine.resolveDuel() three times in sequence.
 * Strategic hook: winner carries remaining HP% into the next round.
 *
 * Interaction customIds routed from index.js:
 *   war_accept_<id>
 *   war_decline_<id>
 *   war_pick_<id>_<userId>         (StringSelectMenu, min 3, max 3)
 *   war_stance_<id>_<userId>_<stance>  (Button)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, EmbedBuilder, AttachmentBuilder,
} = require('discord.js');

const db     = require('./db.js');
const engine = require('./battleEngine.js');
const { drawBattleFrame } = require('./battleCanvas.js');

const {
  TYPE_EMOJI, TIER_EMOJI, TIER_REWARD_MULT,
  createFighter, resolveDuel,
} = engine;

const BASE_REWARD    = 50;
const CONSOLATION    = 10;
const INVITE_TIMEOUT = 60_000;
const PICK_TIMEOUT   = 120_000;
const TURN_ANIM_MS   = 1_200;

const activeWars = new Map(); // warId → state
const userInWar  = new Map(); // userId → warId

let _client = null;
function init(client) { _client = client; }
function isUserInWar(userId) { return userInWar.has(userId); }

function genId() {
  return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Stance row (same style as duel) ──────────────────────────────────────────
function buildStanceRow(warId, userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`war_stance_${warId}_${userId}_Aggressive`).setLabel('⚔️ Aggressive').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`war_stance_${warId}_${userId}_Defensive`).setLabel('🛡️ Defensive').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`war_stance_${warId}_${userId}_Balanced`).setLabel('⚖️ Balanced').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`war_stance_${warId}_${userId}_Berserker`).setLabel('💢 Berserker').setStyle(ButtonStyle.Success),
    ),
  ];
}

// ── Send team picker DM ───────────────────────────────────────────────────────
async function sendTeamPicker(userId, warId, harem) {
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
    .setCustomId(`war_pick_${warId}_${userId}`)
    .setPlaceholder('Select exactly 3 fighters (in fight order)…')
    .setMinValues(3)
    .setMaxValues(3)
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setColor(0xe84393)
    .setTitle('⚔️ Step 1 — Pick Your Team of 3')
    .setDescription(
      'Select **exactly 3** characters to battle in sequence.\n\n' +
      '**Strategic tip:** The winner of each round carries their remaining HP% into the next.\n' +
      'Lead with a Legendary to snowball, or save it to clutch — it\'s your call.\n\n' +
      '_Fight order = your harem order (Legendary first)._',
    )
    .setFooter({ text: 'You have 2 minutes to choose.' });

  try {
    await user.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    return true;
  } catch {
    return false;
  }
}

// ── Send stance picker DM ─────────────────────────────────────────────────────
async function sendStancePicker(userId, warId, teamRows) {
  const user = await _client.users.fetch(userId).catch(() => null);
  if (!user) return;

  const teamLines = teamRows.map((r, i) => {
    const type = engine.getType(r.character_id);
    return `**${i + 1}.** ${TIER_EMOJI[r.tier]} ${r.character_name} — ${TYPE_EMOJI[type]} ${type}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xe84393)
    .setTitle('⚔️ Step 2 — Choose a Stance for Your Team')
    .setDescription(
      `**Your team:**\n${teamLines.join('\n')}\n\n` +
      `One stance applies to all 3 fighters:\n` +
      `**Aggressive** — Always attack.\n` +
      `**Defensive** — Defend → energy up → Special.\n` +
      `**Balanced** — Mirrors winning moves, switches on loss.\n` +
      `**Berserker** — Always attack; ATK grows as HP drops.`,
    )
    .setFooter({ text: 'Pick a stance to lock in your team.' });

  await user.send({ embeds: [embed], components: buildStanceRow(warId, userId) }).catch(() => {});
}

// ── Animate a single round ────────────────────────────────────────────────────
async function animateRound(fA, fB, log, channelId, roundNum) {
  const channel = await _client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  const snapA = { ...fA, currentHp: fA.maxHp, energy: 0 };
  const snapB = { ...fB, currentHp: fB.maxHp, energy: 0 };

  let msg;
  try {
    const buf = await drawBattleFrame({ fighterA: snapA, fighterB: snapB, turn: 0, lastResult: `⚔️ Round ${roundNum} begins!`, ended: false });
    msg = await channel.send({ files: [new AttachmentBuilder(buf, { name: 'battle.png' })] });
  } catch { return null; }

  for (const entry of log) {
    await sleep(TURN_ANIM_MS);
    snapA.currentHp = entry.hpA; snapA.energy = entry.energyA;
    snapB.currentHp = entry.hpB; snapB.energy = entry.energyB;
    const caption = entry.typeNote ? `${entry.description} ${entry.typeNote}` : entry.description;
    try {
      const buf = await drawBattleFrame({ fighterA: snapA, fighterB: snapB, turn: entry.turn, lastResult: caption, ended: false });
      await msg.edit({ files: [new AttachmentBuilder(buf, { name: 'battle.png' })] });
    } catch {}
  }

  return msg;
}

// ── Run the full 3-round gauntlet ─────────────────────────────────────────────
async function runWarfare(war) {
  const channel = await _client.channels.fetch(war.channelId).catch(() => null);

  const aTeam = war.challengerTeam; // [{row, fighter}]
  const bTeam = war.opponentTeam;

  const aRoster = aTeam.map(e => e.fighter);
  const bRoster = bTeam.map(e => e.fighter);

  // Announce start
  if (channel) {
    const teamALines = aRoster.map((f, i) => `**${i + 1}.** ${TIER_EMOJI[f.tier]} ${f.name} ${TYPE_EMOJI[f.type]}`).join('\n');
    const teamBLines = bRoster.map((f, i) => `**${i + 1}.** ${TIER_EMOJI[f.tier]} ${f.name} ${TYPE_EMOJI[f.type]}`).join('\n');
    const startEmbed = new EmbedBuilder()
      .setColor(0xe84393)
      .setTitle('⚔️ 3v3 Warfare Begins!')
      .addFields(
        { name: `<@${war.challengerId}> (${war.challengerStance})`, value: teamALines, inline: true },
        { name: `<@${war.opponentId}> (${war.opponentStance})`, value: teamBLines, inline: true },
      );
    await channel.send({ embeds: [startEmbed] }).catch(() => {});
  }

  // Track kills and round results
  // aScore = how many of B's fighters A killed (challenger's score)
  // bScore = how many of A's fighters B killed (opponent's score)
  const roundSummary = [];
  let aScore = 0, bScore = 0;

  // Gauntlet: survivors carry their HP into the next round
  let aIdx = 0, bIdx = 0;
  let survivingA = aRoster[0];
  let survivingB = bRoster[0];
  let roundNum = 1;

  while (aIdx < 3 && bIdx < 3) {
    const fA = survivingA;
    const fB = survivingB;

    if (channel) {
      const rEmbed = new EmbedBuilder()
        .setColor(0xe84393)
        .setDescription(
          `**Round ${roundNum}:** ${TIER_EMOJI[fA.tier]} ${fA.name} (${Math.round(fA.currentHp / fA.maxHp * 100)}% HP) ` +
          `vs ${TIER_EMOJI[fB.tier]} ${fB.name} (${Math.round(fB.currentHp / fB.maxHp * 100)}% HP)`,
        );
      await channel.send({ embeds: [rEmbed] }).catch(() => {});
    }

    const { winner, log } = resolveDuel(fA, fB);
    await animateRound(fA, fB, log, war.channelId, roundNum);

    await sleep(600);

    roundSummary.push({
      round: roundNum,
      winner: winner,
      aFighter: fA.name, bFighter: fB.name,
    });

    // Determine whether this round ends the match BEFORE incrementing indices
    const winFighter  = winner === 'A' ? fA : fB;
    const isMatchOver = (winner === 'A' && bIdx === 2) || (winner === 'B' && aIdx === 2);

    if (channel) {
      const roundEmbed = new EmbedBuilder()
        .setColor(0xffd700)
        .setDescription(
          isMatchOver
            ? `**Round ${roundNum} — Match Over!** 🏆 ${TIER_EMOJI[winFighter.tier]} **${winFighter.name}** lands the final blow!`
            : `**Round ${roundNum} over!** 🏆 ${TIER_EMOJI[winFighter.tier]} **${winFighter.name}** wins!\n` +
              `(${winFighter.currentHp}/${winFighter.maxHp} HP remaining — advancing to next round)`,
        );
      await channel.send({ embeds: [roundEmbed] }).catch(() => {});
    }

    if (winner === 'A') {
      // A killed a B fighter — A's score goes up, move to next B fighter
      aScore++;
      bIdx++;
      if (bIdx < 3) survivingB = bRoster[bIdx];
      // survivingA keeps current HP (carry-over)
    } else {
      // B killed an A fighter — B's score goes up, move to next A fighter
      bScore++;
      aIdx++;
      if (aIdx < 3) survivingA = aRoster[aIdx];
    }

    roundNum++;
    if (roundNum > 6) break; // safety cap
  }

  // Determine overall winner: more KOs wins; tie goes to challenger
  const challengerWon = aScore >= bScore;
  const winnerId = challengerWon ? war.challengerId : war.opponentId;
  const loserId  = challengerWon ? war.opponentId   : war.challengerId;

  // Payout: sum of rewards for each fighter the winner killed
  const winnerKills    = challengerWon ? aScore : bScore;
  const killedRoster   = challengerWon ? bRoster : aRoster;
  const killedFighters = killedRoster.slice(0, winnerKills);
  const payout = Math.max(
    CONSOLATION,
    killedFighters.reduce((sum, f) => sum + Math.round(BASE_REWARD * (TIER_REWARD_MULT[f.tier] ?? 1)), 0),
  );

  const winnerKOs = challengerWon ? aScore : bScore;
  const loserKOs  = challengerWon ? bScore : aScore;

  await Promise.all([
    db.addBalance(winnerId, payout).catch(() => {}),
    db.addBalance(loserId, CONSOLATION).catch(() => {}),
    db.logDuel(winnerId, loserId, 'warfare-team', 'warfare-team', roundNum - 1, payout).catch(() => {}),
  ]);

  if (channel) {
    const winUser  = await _client.users.fetch(winnerId).catch(() => null);
    const loseUser = await _client.users.fetch(loserId).catch(() => null);
    const summary = roundSummary.map(r =>
      `**Round ${r.round}:** ${r.aFighter} vs ${r.bFighter} → **${r.winner === 'A' ? r.aFighter : r.bFighter}** wins`
    ).join('\n');

    const finalEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 Warfare — Final Result!')
      .setDescription(
        `**Winner:** <@${winnerId}> (${winnerKOs} KOs)\n` +
        `**Loser:** <@${loserId}> (${loserKOs} KOs)\n\n` +
        `🌸 **${winUser?.username ?? 'Winner'}** earns **${payout} Petals**!\n` +
        `🌸 **${loseUser?.username ?? 'Loser'}** gets **${CONSOLATION} Petals** consolation.\n\n` +
        `**Round recap:**\n${summary}`,
      );
    await channel.send({ embeds: [finalEmbed] }).catch(() => {});
  }

  cleanupWar(war.id);
}

function cleanupWar(warId) {
  const war = activeWars.get(warId);
  if (!war) return;
  userInWar.delete(war.challengerId);
  userInWar.delete(war.opponentId);
  activeWars.delete(warId);
}

async function checkReady(war) {
  const allSet = war.challengerTeam && war.opponentTeam && war.challengerStance && war.opponentStance;
  if (allSet) {
    // Build fighters
    war.challengerTeam = war.challengerTeam.map(row =>
      createFighter(war.challengerId, row, war.challengerStance)
    );
    war.opponentTeam = war.opponentTeam.map(row =>
      createFighter(war.opponentId, row, war.opponentStance)
    );

    // Convert arrays to {fighter} format for internal use
    war.challengerTeam = war.challengerTeam.map(f => ({ fighter: f }));
    war.opponentTeam   = war.opponentTeam.map(f => ({ fighter: f }));

    war.status = 'battling';
    await runWarfare(war);
  }
}

// ── Public: start warfare ─────────────────────────────────────────────────────
async function startWarfare(message, opponent) {
  const challengerId = message.author.id;
  const opponentId   = opponent.id;

  if (challengerId === opponentId) return message.reply("🤣 You can't warfare yourself.");
  if (opponent.bot) return message.reply("🤖 You can't warfare a bot.");
  if (userInWar.has(challengerId)) return message.reply("⚔️ You're already in a warfare match!");
  if (userInWar.has(opponentId)) return message.reply(`⚔️ **${opponent.username}** is already in a warfare match.`);
  // Also check duel state (import not needed, checked by caller via userInDuel)

  const [challengerHarem, opponentHarem] = await Promise.all([
    db.getHarem(challengerId),
    db.getHarem(opponentId),
  ]);

  if (challengerHarem.length < 3) return message.reply("💔 You need **at least 3 characters** in your harem for warfare.");
  if (opponentHarem.length < 3) return message.reply(`💔 **${opponent.username}** needs at least 3 harem characters for warfare.`);

  const warId = genId();

  const inviteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`war_accept_${warId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`war_decline_${warId}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
  );

  const inviteEmbed = new EmbedBuilder()
    .setColor(0xe84393)
    .setTitle('⚔️ 3v3 Warfare Challenge!')
    .setDescription(
      `**${message.author.username}** challenges you to a **3v3 warfare gauntlet**!\n\n` +
      `• Each player picks **3 fighters** + a **combat stance**\n` +
      `• Fighters battle in sequence; the winner carries their HP into the next round\n` +
      `• The team that wins the most rounds takes the prize!\n\n` +
      `💡 Strategy matters — team order and stance decide everything.`,
    )
    .setFooter({ text: 'You have 60 seconds to respond.' });

  let inviteDmMsg;
  try {
    inviteDmMsg = await (await opponent.createDM()).send({ embeds: [inviteEmbed], components: [inviteRow] });
  } catch {
    return message.reply(`❌ Couldn't DM **${opponent.username}**. They need DMs from server members enabled.`);
  }

  const war = {
    id: warId, channelId: message.channel.id,
    challengerId, opponentId,
    challengerHarem, opponentHarem,
    status: 'invite',
    challengerTeamRows: null,  // raw harem rows
    opponentTeamRows: null,
    challengerTeam: null,      // converted to fighters when both ready
    opponentTeam: null,
    challengerStance: null,
    opponentStance: null,
    inviteDmMsg,
  };

  activeWars.set(warId, war);
  userInWar.set(challengerId, warId);
  userInWar.set(opponentId, warId);

  await message.reply(`⚔️ <@${opponentId}>, **${message.author.username}** challenges you to 3v3 warfare! Check your DMs.`);

  setTimeout(async () => {
    const w = activeWars.get(warId);
    if (w && w.status === 'invite') {
      cleanupWar(warId);
      inviteDmMsg.edit({ content: '⏰ Warfare invite expired.', components: [] }).catch(() => {});
      const ch = await _client.channels.fetch(war.channelId).catch(() => null);
      if (ch) ch.send(`⏰ Warfare between <@${challengerId}> and <@${opponentId}> expired.`).catch(() => {});
    }
  }, INVITE_TIMEOUT);
}

// ── Interaction router ────────────────────────────────────────────────────────
async function handleInteraction(interaction) {
  const id = interaction.customId;
  if (id.startsWith('war_accept_'))  return handleAccept(interaction, id.slice('war_accept_'.length));
  if (id.startsWith('war_decline_')) return handleDecline(interaction, id.slice('war_decline_'.length));
  if (id.startsWith('war_pick_'))    return handlePick(interaction, id);
  if (id.startsWith('war_stance_'))  return handleStance(interaction, id);
}

async function handleAccept(interaction, warId) {
  const war = activeWars.get(warId);
  if (!war || war.status !== 'invite') return interaction.update({ content: '⏰ Already expired.', components: [] }).catch(() => {});
  if (interaction.user.id !== war.opponentId) return interaction.reply({ content: "Not for you.", ephemeral: true });

  war.status = 'picking';
  await interaction.update({ content: '✅ Accepted! Sending team picker…', components: [], embeds: [] }).catch(() => {});

  const [okC, okO] = await Promise.all([
    sendTeamPicker(war.challengerId, warId, war.challengerHarem),
    sendTeamPicker(war.opponentId,   warId, war.opponentHarem),
  ]);

  if (!okC || !okO) {
    cleanupWar(warId);
    const ch = await _client.channels.fetch(war.channelId).catch(() => null);
    if (ch) ch.send(`❌ Warfare cancelled — couldn't DM a player.`).catch(() => {});
    return;
  }

  setTimeout(async () => {
    const w = activeWars.get(warId);
    if (w && w.status === 'picking') {
      cleanupWar(warId);
      const ch = await _client.channels.fetch(war.channelId).catch(() => null);
      if (ch) ch.send(`⏰ Warfare cancelled — team selection timed out.`).catch(() => {});
    }
  }, PICK_TIMEOUT);
}

async function handleDecline(interaction, warId) {
  const war = activeWars.get(warId);
  if (!war) return interaction.update({ content: '⏰ Already gone.', components: [] }).catch(() => {});
  if (interaction.user.id !== war.opponentId) return interaction.reply({ content: "Not for you.", ephemeral: true });

  cleanupWar(warId);
  await interaction.update({ content: '❌ Warfare declined.', components: [], embeds: [] }).catch(() => {});
  const ch = await _client.channels.fetch(war.channelId).catch(() => null);
  if (ch) ch.send(`❌ <@${war.opponentId}> declined the warfare from <@${war.challengerId}>.`).catch(() => {});
}

async function handlePick(interaction, customId) {
  // war_pick_<warId>_<userId>
  const parts = customId.split('_');
  const warId  = parts[2];
  const userId = parts[3];
  const war    = activeWars.get(warId);

  if (!war || war.status !== 'picking') return interaction.update({ content: '⏰ Expired.', components: [] }).catch(() => {});
  if (interaction.user.id !== userId) return interaction.reply({ content: "Not for you.", ephemeral: true });

  const isChallenger = userId === war.challengerId;
  const harem = isChallenger ? war.challengerHarem : war.opponentHarem;
  const indices = interaction.values.map(v => parseInt(v, 10));
  const teamRows = indices.map(i => harem[i]).filter(Boolean);

  if (teamRows.length < 3) return interaction.reply({ content: '⚠️ Couldn\'t find all 3 selected characters.', ephemeral: true });

  if (isChallenger) war.challengerTeamRows = teamRows;
  else              war.opponentTeamRows   = teamRows;

  const preview = teamRows.map((r, i) => {
    const type = engine.getType(r.character_id);
    return `**${i + 1}.** ${TIER_EMOJI[r.tier]} ${r.character_name} ${TYPE_EMOJI[type]}`;
  }).join('\n');

  await interaction.update({ content: `✅ Team selected:\n${preview}\n\nNow pick your stance!`, components: [], embeds: [] }).catch(() => {});
  await sendStancePicker(userId, warId, teamRows);
}

async function handleStance(interaction, customId) {
  // war_stance_<warId>_<userId>_<Stance>
  const parts  = customId.split('_');
  const warId  = parts[2];
  const userId = parts[3];
  const stance = parts[4];
  const war    = activeWars.get(warId);

  if (!war || war.status !== 'picking') return interaction.update({ content: '⏰ Expired.', components: [] }).catch(() => {});
  if (interaction.user.id !== userId) return interaction.reply({ content: "Not for you.", ephemeral: true });

  const isChallenger = userId === war.challengerId;
  const teamRows = isChallenger ? war.challengerTeamRows : war.opponentTeamRows;
  if (!teamRows) return interaction.reply({ content: '⚠️ Pick your team first.', ephemeral: true });

  if (isChallenger) {
    war.challengerStance = stance;
    war.challengerTeam   = teamRows; // will be converted to fighters in checkReady
  } else {
    war.opponentStance = stance;
    war.opponentTeam   = teamRows;
  }

  await interaction.update({ content: `✅ **${stance}** stance locked in for your whole team! Waiting for opponent…`, components: [] }).catch(() => {});
  await checkReady(war);
}

module.exports = { init, startWarfare, handleInteraction, isUserInWar };
