/**
 * warfareEngine.js — x!warfare 3v3 gauntlet handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Supports:
 *   • PvP warfare  (x!warfare @user)  — both players pick 3 fighters + stance
 *   • Bot warfare  (x!warfare bot)    — user picks team, bot auto-picks 3
 *
 * XP on win: 20 XP each to all fighters in the winning team (PvP & Bot).
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
const XP_WIN         = 20; // per fighter in winning team
const INVITE_TIMEOUT = 60_000;
const PICK_TIMEOUT   = 120_000;
const TURN_ANIM_MS   = 1_200;

const activeWars = new Map();
const userInWar  = new Map();

let _client = null;
function init(client) { _client = client; }
function isUserInWar(userId) { return userInWar.has(userId); }

function genId() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeBotLevel(harem) {
  if (!harem.length) return 5;
  const avg    = Math.round(harem.reduce((s, r) => s + (r.level || 1), 0) / harem.length);
  const offset = Math.floor(Math.random() * 11) - 5;
  return Math.max(1, Math.min(engine.MAX_LEVEL, avg + offset));
}

async function createBotRow(level) {
  let char = null;
  try { char = await getRandomCharacter({}); } catch {}
  if (char) {
    return {
      id: null, character_id: char.id, character_name: char.name,
      source_title: char.source, image_url: char.image,
      tier: char.tier.name, level,
    };
  }
  const tiers = ['Common', 'Uncommon', 'Rare'];
  return {
    id: null, character_id: 100000 + Math.floor(Math.random() * 800000),
    character_name: 'Bot Fighter', source_title: 'System', image_url: null,
    tier: tiers[Math.floor(Math.random() * tiers.length)], level,
  };
}

// ── Stance buttons ────────────────────────────────────────────────────────────
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

// ── Team picker DM ────────────────────────────────────────────────────────────
async function sendTeamPicker(userId, warId, harem) {
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
    .setCustomId(`war_pick_${warId}_${userId}`)
    .setPlaceholder('Select exactly 3 fighters (in fight order)…')
    .setMinValues(3).setMaxValues(3)
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setColor(0xe84393)
    .setTitle('⚔️ Step 1 — Pick Your Team of 3')
    .setDescription(
      'Select **exactly 3** characters to battle in sequence.\n\n' +
      '**Strategic tip:** The winner of each round carries their remaining HP% into the next.\n' +
      'Lead with a Legendary to snowball, or save it to clutch — it\'s your call.\n\n' +
      '_Fight order = your selection order._',
    )
    .setFooter({ text: 'You have 2 minutes to choose.' });

  try {
    await user.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    return true;
  } catch { return false; }
}

// ── Stance picker DM ──────────────────────────────────────────────────────────
async function sendStancePicker(userId, warId, teamRows) {
  const user = await _client.users.fetch(userId).catch(() => null);
  if (!user) return;

  const teamLines = teamRows.map((r, i) => {
    const type = engine.getType(r.character_id);
    return `**${i + 1}.** ${TIER_EMOJI[r.tier]} ${r.character_name} ${LEVEL_EMOJI}Lv${r.level || 1} — ${TYPE_EMOJI[type]} ${type}`;
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

// ── XP helper ─────────────────────────────────────────────────────────────────
async function awardTeamXP(userId, roster) {
  const results = await Promise.all(
    roster
      .filter(f => f.haremId)
      .map(f => db.awardXP(userId, f.haremId, XP_WIN).catch(() => null)),
  );
  const levelUps = results.filter(r => r?.leveled);
  return levelUps;
}

function levelUpLines(levelUps, roster) {
  if (!levelUps.length) return '';
  return '\n' + levelUps.map(r => {
    const f = roster.find(x => x.haremId && x.level === r.oldLevel);
    const name = f?.name ?? 'A character';
    return `${LEVELUP_EMOJI} **${name}** leveled up! Lv **${r.oldLevel} → ${r.newLevel}**`;
  }).join('\n');
}

// ── Gauntlet core (shared by PvP and Bot) ─────────────────────────────────────
async function runGauntlet(war, aRoster, bRoster, aLabel, bLabel) {
  const channel = await _client.channels.fetch(war.channelId).catch(() => null);

  const teamALines = aRoster.map((f, i) => `**${i + 1}.** ${TIER_EMOJI[f.tier]} ${f.name} ${LEVEL_EMOJI}Lv${f.level} ${TYPE_EMOJI[f.type]}`).join('\n');
  const teamBLines = bRoster.map((f, i) => `**${i + 1}.** ${TIER_EMOJI[f.tier]} ${f.name} ${LEVEL_EMOJI}Lv${f.level} ${TYPE_EMOJI[f.type]}`).join('\n');

  if (channel) {
    const startEmbed = new EmbedBuilder()
      .setColor(0xe84393)
      .setTitle('⚔️ 3v3 Warfare Begins!')
      .addFields(
        { name: aLabel, value: teamALines, inline: true },
        { name: bLabel, value: teamBLines, inline: true },
      );
    await channel.send({ embeds: [startEmbed] }).catch(() => {});
  }

  const roundSummary = [];
  let aScore = 0, bScore = 0;
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
          `**Round ${roundNum}:** ${TIER_EMOJI[fA.tier]} ${fA.name} ${LEVEL_EMOJI}Lv${fA.level} (${Math.round(fA.currentHp / fA.maxHp * 100)}% HP) ` +
          `vs ${TIER_EMOJI[fB.tier]} ${fB.name} ${LEVEL_EMOJI}Lv${fB.level} (${Math.round(fB.currentHp / fB.maxHp * 100)}% HP)`,
        );
      await channel.send({ embeds: [rEmbed] }).catch(() => {});
    }

    const { winner, log } = resolveDuel(fA, fB);
    await animateRound(fA, fB, log, war.channelId, roundNum);
    await sleep(600);

    roundSummary.push({ round: roundNum, winner, aFighter: fA.name, bFighter: fB.name });

    const winFighter  = winner === 'A' ? fA : fB;
    const isMatchOver = (winner === 'A' && bIdx === 2) || (winner === 'B' && aIdx === 2);

    if (channel) {
      const roundEmbed = new EmbedBuilder()
        .setColor(0xffd700)
        .setDescription(
          isMatchOver
            ? `**Round ${roundNum} — Match Over!** 🏆 ${TIER_EMOJI[winFighter.tier]} **${winFighter.name}** lands the final blow!`
            : `**Round ${roundNum} over!** 🏆 ${TIER_EMOJI[winFighter.tier]} **${winFighter.name}** wins!\n` +
              `(${winFighter.currentHp}/${winFighter.maxHp} HP remaining — advancing)`,
        );
      await channel.send({ embeds: [roundEmbed] }).catch(() => {});
    }

    if (winner === 'A') { aScore++; bIdx++; if (bIdx < 3) survivingB = bRoster[bIdx]; }
    else                { bScore++; aIdx++; if (aIdx < 3) survivingA = aRoster[aIdx]; }
    roundNum++;
    if (roundNum > 6) break;
  }

  return { aScore, bScore, roundSummary, roundNum };
}

// ── PvP warfare runner ────────────────────────────────────────────────────────
async function runWarfare(war) {
  const aTeam   = war.challengerTeam;
  const bTeam   = war.opponentTeam;
  const aRoster = aTeam.map(e => e.fighter);
  const bRoster = bTeam.map(e => e.fighter);

  const aLabel = `<@${war.challengerId}> (${war.challengerStance})`;
  const bLabel = `<@${war.opponentId}> (${war.opponentStance})`;

  const { aScore, bScore, roundSummary, roundNum } = await runGauntlet(war, aRoster, bRoster, aLabel, bLabel);

  const challengerWon = aScore >= bScore;
  const winnerId = challengerWon ? war.challengerId : war.opponentId;
  const loserId  = challengerWon ? war.opponentId   : war.challengerId;
  const winnerRoster = challengerWon ? aRoster : bRoster;
  const loserRoster  = challengerWon ? bRoster : aRoster;
  const winnerKOs    = challengerWon ? aScore : bScore;
  const loserKOs     = challengerWon ? bScore : aScore;

  const killedFighters = loserRoster.slice(0, winnerKOs);
  const payout = Math.max(
    CONSOLATION,
    killedFighters.reduce((sum, f) => sum + Math.round(BASE_REWARD * (TIER_REWARD_MULT[f.tier] ?? 1)), 0),
  );

  const [, , levelUps] = await Promise.all([
    db.addBalance(winnerId, payout).catch(() => {}),
    db.addBalance(loserId, CONSOLATION).catch(() => {}),
    awardTeamXP(winnerId, winnerRoster),
    db.logDuel(winnerId, loserId, 'warfare-team', 'warfare-team', roundNum - 1, payout).catch(() => {}),
  ]);

  const channel = await _client.channels.fetch(war.channelId).catch(() => null);
  if (channel) {
    const winUser  = await _client.users.fetch(winnerId).catch(() => null);
    const loseUser = await _client.users.fetch(loserId).catch(() => null);
    const summary  = roundSummary.map(r =>
      `**Round ${r.round}:** ${r.aFighter} vs ${r.bFighter} → **${r.winner === 'A' ? r.aFighter : r.bFighter}** wins`,
    ).join('\n');

    const finalEmbed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 Warfare — Final Result!')
      .setDescription(
        `**Winner:** <@${winnerId}> (${winnerKOs} KOs)\n` +
        `**Loser:** <@${loserId}> (${loserKOs} KOs)\n\n` +
        `🌸 **${winUser?.username ?? 'Winner'}** earns **${payout} Petals**!\n` +
        `🌸 **${loseUser?.username ?? 'Loser'}** gets **${CONSOLATION} Petals** consolation.\n` +
        `⚡ **+${XP_WIN} XP** awarded to each winning fighter!` +
        levelUpLines(levelUps, winnerRoster) +
        `\n\n**Round recap:**\n${summary}`,
      );
    await channel.send({ embeds: [finalEmbed] }).catch(() => {});
  }

  cleanupWar(war.id);
}

// ── Bot warfare runner ────────────────────────────────────────────────────────
async function runBotWarfare(war) {
  const aRoster = war.challengerTeam.map(e => e.fighter);
  const bRoster = war.botTeam;
  const botStance = war.botStance;

  const aLabel = `<@${war.challengerId}> (${war.challengerStance})`;
  const bLabel = `${BOT_EMOJI} Bot (${botStance})`;

  const { aScore, bScore, roundSummary, roundNum } = await runGauntlet(war, aRoster, bRoster, aLabel, bLabel);

  const userWon      = aScore >= bScore;
  const winnerRoster = userWon ? aRoster : bRoster;
  const winnerKOs    = userWon ? aScore  : bScore;
  const loserKOs     = userWon ? bScore  : aScore;

  let levelUps = [];
  if (userWon) levelUps = await awardTeamXP(war.challengerId, aRoster);

  const channel = await _client.channels.fetch(war.channelId).catch(() => null);
  if (channel) {
    const summary = roundSummary.map(r =>
      `**Round ${r.round}:** ${r.aFighter} vs ${r.bFighter} → **${r.winner === 'A' ? r.aFighter : r.bFighter}** wins`,
    ).join('\n');

    const finalEmbed = new EmbedBuilder()
      .setColor(userWon ? 0xffd700 : 0xff4757)
      .setTitle(userWon ? '🏆 You beat the bot team!' : `${BOT_EMOJI} Bot team wins!`)
      .setDescription(
        `**Your KOs:** ${loserKOs > winnerKOs ? winnerKOs : loserKOs} → **Bot KOs:** ${userWon ? loserKOs : winnerKOs}\n\n` +
        (userWon
          ? `⚡ **+${XP_WIN} XP** awarded to each of your fighters!` + levelUpLines(levelUps, aRoster)
          : `No XP gained — better luck next time!`) +
        `\n\n**Round recap:**\n${summary}`,
      );
    await channel.send({ embeds: [finalEmbed] }).catch(() => {});
  }

  cleanupWar(war.id);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
function cleanupWar(warId) {
  const war = activeWars.get(warId);
  if (!war) return;
  userInWar.delete(war.challengerId);
  if (war.opponentId && war.opponentId !== 'BOT') userInWar.delete(war.opponentId);
  activeWars.delete(warId);
}

async function checkReady(war) {
  if (war.isBot) {
    if (war.challengerTeam && war.challengerStance) {
      war.challengerTeam = war.challengerTeam.map(row => createFighter(war.challengerId, row, war.challengerStance));
      war.challengerTeam = war.challengerTeam.map(f => ({ fighter: f }));
      war.status = 'battling';
      await runBotWarfare(war);
    }
    return;
  }

  const allSet = war.challengerTeam && war.opponentTeam && war.challengerStance && war.opponentStance;
  if (allSet) {
    war.challengerTeam = war.challengerTeam.map(row => createFighter(war.challengerId, row, war.challengerStance));
    war.opponentTeam   = war.opponentTeam.map(row   => createFighter(war.opponentId,   row, war.opponentStance));
    war.challengerTeam = war.challengerTeam.map(f => ({ fighter: f }));
    war.opponentTeam   = war.opponentTeam.map(f   => ({ fighter: f }));
    war.status = 'battling';
    await runWarfare(war);
  }
}

// ── Public: start PvP warfare ─────────────────────────────────────────────────
async function startWarfare(message, opponent) {
  const challengerId = message.author.id;
  const opponentId   = opponent.id;

  if (challengerId === opponentId) return message.reply("🤣 You can't warfare yourself.");
  if (opponent.bot) return message.reply("🤖 Use `x!warfare bot` to fight a bot team!");
  if (userInWar.has(challengerId)) return message.reply("⚔️ You're already in a warfare match!");
  if (userInWar.has(opponentId)) return message.reply(`⚔️ **${opponent.username}** is already in a warfare match.`);

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
    isBot: false,
    challengerHarem, opponentHarem,
    status: 'invite',
    challengerTeamRows: null, opponentTeamRows: null,
    challengerTeam: null, opponentTeam: null,
    challengerStance: null, opponentStance: null,
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

// ── Public: start bot warfare ─────────────────────────────────────────────────
async function startBotWarfare(message) {
  const userId = message.author.id;

  if (userInWar.has(userId)) return message.reply("⚔️ You're already in a warfare match!");

  const harem = await db.getHarem(userId);
  if (harem.length < 3) return message.reply("💔 You need **at least 3 characters** in your harem for warfare.");

  const warId = genId();

  // Pre-build 3 bot fighters
  const botLevel = computeBotLevel(harem);
  const botRows  = await Promise.all([createBotRow(botLevel), createBotRow(botLevel), createBotRow(botLevel)]);
  const botStances = ['Aggressive', 'Defensive', 'Balanced', 'Berserker'];
  const botStance  = botStances[Math.floor(Math.random() * botStances.length)];
  const botTeam    = botRows.map(row => createFighter('BOT', row, botStance));

  const war = {
    id: warId, channelId: message.channel.id,
    challengerId: userId, opponentId: 'BOT',
    isBot: true, botTeam, botStance,
    challengerHarem: harem,
    status: 'picking',
    challengerTeamRows: null,
    challengerTeam: null, opponentTeam: null,
    challengerStance: null, opponentStance: null,
  };

  activeWars.set(warId, war);
  userInWar.set(userId, warId);

  const botLines = botTeam.map((f, i) =>
    `**${i + 1}.** ${TIER_EMOJI[f.tier]} ${f.name} ${LEVEL_EMOJI}Lv${f.level} ${TYPE_EMOJI[f.type]}`,
  ).join('\n');

  await message.reply(
    `${BOT_EMOJI} ${VS_EMOJI} **Bot Warfare!** The bot picked a team:\n${botLines}\n\nCheck your DMs to pick your fighters!`,
  );

  const ok = await sendTeamPicker(userId, warId, harem);
  if (!ok) {
    cleanupWar(warId);
    return message.channel.send(`❌ Couldn't DM <@${userId}> — enable DMs from server members.`).catch(() => {});
  }

  setTimeout(async () => {
    const w = activeWars.get(warId);
    if (w && w.status === 'picking') {
      cleanupWar(warId);
      const ch = await _client.channels.fetch(war.channelId).catch(() => null);
      if (ch) ch.send(`⏰ Bot warfare expired — you didn't pick in time.`).catch(() => {});
    }
  }, PICK_TIMEOUT);
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
  const parts  = customId.split('_');
  const warId  = parts[2];
  const userId = parts[3];
  const war    = activeWars.get(warId);

  if (!war || war.status !== 'picking') return interaction.update({ content: '⏰ Expired.', components: [] }).catch(() => {});
  if (interaction.user.id !== userId) return interaction.reply({ content: "Not for you.", ephemeral: true });

  const isChallenger = userId === war.challengerId;
  const harem   = isChallenger ? war.challengerHarem : war.opponentHarem;
  const indices = interaction.values.map(v => parseInt(v, 10));
  const teamRows = indices.map(i => harem[i]).filter(Boolean);

  if (teamRows.length < 3) return interaction.reply({ content: '⚠️ Couldn\'t find all 3 selected characters.', ephemeral: true });

  if (isChallenger) war.challengerTeamRows = teamRows;
  else              war.opponentTeamRows   = teamRows;

  const preview = teamRows.map((r, i) => {
    const type = engine.getType(r.character_id);
    return `**${i + 1}.** ${TIER_EMOJI[r.tier]} ${r.character_name} ${LEVEL_EMOJI}Lv${r.level || 1} ${TYPE_EMOJI[type]}`;
  }).join('\n');

  await interaction.update({ content: `✅ Team selected:\n${preview}\n\nNow pick your stance!`, components: [], embeds: [] }).catch(() => {});
  await sendStancePicker(userId, warId, teamRows);
}

async function handleStance(interaction, customId) {
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
    war.challengerTeam   = teamRows;
  } else {
    war.opponentStance = stance;
    war.opponentTeam   = teamRows;
  }

  await interaction.update({ content: `✅ **${stance}** stance locked in for your whole team! Waiting for opponent…`, components: [] }).catch(() => {});
  await checkReady(war);
}

module.exports = { init, startWarfare, startBotWarfare, handleInteraction, isUserInWar };
