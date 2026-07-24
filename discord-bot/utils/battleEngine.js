/**
 * battleEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared combat core used by both x!duel (1v1) and x!warfare (3v3).
 *
 *  • Elemental type system  — hash-based, 7 elements, never stored
 *  • Level system           — per-character, max 35, stored in DB
 *  • Stat formula           — HP / ATK / DEF / SpecialMult from tier + level
 *  • Stance AI              — four stances that drive every turn decision
 *  • resolveDuel()          — runs a full match and returns the turn log
 *  • resolveMoves()         — single-turn outcome given two actions
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Elemental type system ─────────────────────────────────────────────────────
const TYPES = ['Blaze', 'Tide', 'Thunder', 'Nature', 'Crystal', 'Gale', 'Frost'];

const TYPE_EMOJI = {
  Blaze:   '<:blaze:1529553034143863035>',
  Tide:    '<:tide:1529552658539741338>',
  Crystal: '<:crystal:1529552812420370442>',
  Thunder: '<:thunder:1529551093510439114>',
  Gale:    '<:gale:1529552740160770089>',
  Frost:   '<:frost:1529552493657325699>',
  Nature:  '<:nature:1529552588679286934>',
};

const TYPE_COLOR = {
  Blaze:   '#ff4500',
  Tide:    '#1e90ff',
  Thunder: '#ffd700',
  Nature:  '#32cd32',
  Crystal: '#00ced1',
  Gale:    '#87ceeb',
  Frost:   '#b0e0e6',
};

// Win/lose emojis
const WIN_EMOJI  = '<:win:1529553440861065395>';
const LOSE_EMOJI = '<:lose:1529553474604499095>';

// Advantage table: attacker → types it beats (strong vs)
const STRONG_VS = {
  Blaze:   ['Nature', 'Frost'],
  Tide:    ['Blaze', 'Crystal'],
  Thunder: ['Tide', 'Gale'],
  Nature:  ['Tide', 'Crystal'],
  Crystal: ['Thunder', 'Blaze'],
  Gale:    ['Frost', 'Nature'],
  Frost:   ['Gale', 'Nature'],
};

/**
 * Deterministic hash of an AniList character ID.
 * Same ID always maps to the same element across all users and all pulls.
 */
function hashId(id) {
  let h = (Math.abs(id) | 0) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

function getType(characterId) {
  return TYPES[hashId(characterId) % TYPES.length];
}

/** Returns 1.3 (advantage), 0.7 (disadvantage), or 1.0 (neutral/same). */
function getTypeMultiplier(attackerType, defenderType) {
  if (attackerType === defenderType) return 1.0;
  if (STRONG_VS[attackerType]?.includes(defenderType)) return 1.3;
  if (STRONG_VS[defenderType]?.includes(attackerType)) return 0.7;
  return 1.0;
}

// ── Tier stats ────────────────────────────────────────────────────────────────
const TIER_BONUS = { Legendary: 150, Epic: 90, Rare: 50, Uncommon: 20, Common: 0 };
const TIER_EMOJI = {
  Legendary: '<:legendary:1529541756050210937>',
  Epic:      '<:epic:1529541878834528266>',
  Rare:      '<:rare:1529541977865982176>',
  Uncommon:  '<:uncommon:1529542086414831696>',
  Common:    '<:common:1529542196129435838>',
};
const TIER_REWARD_MULT = { Legendary: 2.5, Epic: 2.0, Rare: 1.6, Uncommon: 1.3, Common: 1.0 };

/**
 * Convert a Discord emoji string (`<:name:id>` or `<a:name:id>`) into the
 * object format required by discord.js components (e.g. select-menu options).
 * Falls back to `{ name: str }` for plain Unicode emojis or unknown input.
 */
function parseCustomEmoji(str) {
  const match = String(str).match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
  if (!match) return { name: str };
  return { animated: match[1] === 'a', name: match[2], id: match[3] };
}

function getTierStats(tier) {
  const bonus = TIER_BONUS[tier] ?? 0;
  return {
    hp:  100 + bonus,
    atk: 10 + Math.floor(bonus / 5),
  };
}

// ── Level system ──────────────────────────────────────────────────────────────
const MAX_LEVEL     = 35;
const LEVEL_EMOJI   = '<:level:1529554482013405275>';
const LEVELUP_EMOJI = '<:Level_UP:1529553553084121241>';
const BOT_EMOJI     = '<:bot:1529554935891628093>';
const VS_EMOJI      = '<:vs:1529555070658543616>';

const TIER_XP_BONUS = { Common: 0, Uncommon: 6, Rare: 12, Epic: 18, Legendary: 25 };
const BASE_XP       = 10;
const MAX_XP        = 80;
const MIN_XP        = 5;

/** XP required to go from `level` to `level + 1`. */
function xpToNextLevel(level) {
  return level * 100; // 100, 200, 300 … 3400
}

/** XP awarded to `winner` for defeating `loser`. Scales with opponent tier/level. */
function xpForOpponent(winner, loser) {
  const tierBonus = TIER_XP_BONUS[loser.tier] ?? 0;
  const levelPart = (loser.level || 1) * 1.5;
  const underdog  = Math.max(0, (loser.level || 1) - (winner.level || 1)) * 2;
  const xp = Math.round(BASE_XP + tierBonus + levelPart + underdog);
  return Math.max(MIN_XP, Math.min(MAX_XP, xp));
}

/**
 * Compute all combat stats for a given tier + level.
 *
 * Stat progression:
 *   Lv  1-10 (1 stat ) : HP only
 *   Lv 10-20 (2 stats) : HP + ATK
 *   Lv 20-30 (3 stats) : HP + ATK + DEF
 *   Lv 30-35 (all    ) : HP + ATK + DEF + SpecialMult + SpecialThreshold
 */
function getLevelStats(tier, level) {
  const base = getTierStats(tier);
  const lvl  = Math.min(Math.max(level || 1, 1), MAX_LEVEL);

  // Stat 1 — HP: +8 every level
  const hp = base.hp + (lvl - 1) * 8;

  // Stat 2 — ATK: +2 per level from lv 10+
  const atk = base.atk + Math.max(0, lvl - 10) * 2;

  // Stat 3 — DEF: +1 flat damage reduction per level from lv 20+
  const def = Math.max(0, lvl - 20) * 1;

  // Stat 4 — Special multiplier: base 1.5x, +0.1 per level from lv 30+
  const specialMult = 1.5 + Math.max(0, lvl - 30) * 0.1;

  // Stat 5 — Special threshold (charges needed): drops at lv 30 and 35
  const specialThreshold = lvl >= 35 ? 1 : lvl >= 30 ? 2 : 3;

  return { hp, atk, def, specialMult, specialThreshold };
}

// ── Fighter factory ───────────────────────────────────────────────────────────
/**
 * Build a fighter object from a DB harem row + a chosen stance.
 * @param {string} userId
 * @param {object} haremRow  — DB row: character_id, character_name, tier, image_url, level, etc.
 * @param {string} stance    — 'Aggressive' | 'Defensive' | 'Balanced' | 'Berserker'
 */
function createFighter(userId, haremRow, stance = 'Aggressive') {
  const level = haremRow.level || 1;
  const stats = getLevelStats(haremRow.tier, level);
  const type  = getType(haremRow.character_id);
  return {
    userId,
    name:             haremRow.character_name,
    tier:             haremRow.tier,
    imageUrl:         haremRow.image_url ?? null,
    haremId:          haremRow.id,
    characterId:      haremRow.character_id,
    level,
    type,
    stance,
    maxHp:            stats.hp,
    currentHp:        stats.hp,
    atk:              stats.atk,
    def:              stats.def,
    specialMult:      stats.specialMult,
    specialThreshold: stats.specialThreshold,
    energy:           0,
    // Internal tracking for stances
    _lastAction: null,
    _lastWon:    null,
  };
}

const ENERGY_MAX = 3; // global cap — fighters accumulate up to 3 charges
const MAX_TURNS  = 15;

// ── Stance AI ─────────────────────────────────────────────────────────────────
function stanceAI(fighter) {
  const { stance, energy, specialThreshold, _lastAction, _lastWon } = fighter;

  switch (stance) {
    case 'Aggressive':
      return 'attack';

    case 'Defensive':
      if (energy >= specialThreshold) return 'special';
      return 'defend';

    case 'Balanced': {
      if (_lastAction === null) return 'attack';
      if (_lastWon) return _lastAction;
      if (_lastAction === 'attack') return 'charge';
      if (_lastAction === 'charge') return energy >= specialThreshold ? 'special' : 'attack';
      if (_lastAction === 'special') return 'attack';
      return 'attack';
    }

    case 'Berserker':
      return 'attack';

    default:
      return 'attack';
  }
}

/** Effective ATK for a fighter this turn (Berserker scales as HP drops). */
function effectiveAtk(fighter) {
  if (fighter.stance !== 'Berserker') return fighter.atk;
  const hpPct = fighter.currentHp / fighter.maxHp;
  return Math.round(fighter.atk * (1 + 0.5 * (1 - hpPct)));
}

// ── Move resolution matrix ────────────────────────────────────────────────────
/**
 * Resolve a pair of simultaneous actions.
 * specAtkA / specAtkB = pre-computed special-move damage (atk * specialMult).
 * Returns raw damage BEFORE type-multiplier and DEF reduction.
 */
function resolveMoves(actionA, actionB, atkA, atkB, specAtkA, specAtkB, nameA, nameB) {
  // Both Special
  if (actionA === 'special' && actionB === 'special') {
    return {
      rawDmgToA: specAtkB, rawDmgToB: specAtkA,
      energyDeltaA: -ENERGY_MAX, energyDeltaB: -ENERGY_MAX,
      description: `💥 Both unleashed their Specials!`,
    };
  }
  if (actionA === 'special') {
    return {
      rawDmgToA: 0, rawDmgToB: specAtkA,
      energyDeltaA: -ENERGY_MAX, energyDeltaB: 0,
      description: `✨ **${nameA}** unleashed a Special! ${nameB}'s move was overridden.`,
    };
  }
  if (actionB === 'special') {
    return {
      rawDmgToA: specAtkB, rawDmgToB: 0,
      energyDeltaA: 0, energyDeltaB: -ENERGY_MAX,
      description: `✨ **${nameB}** unleashed a Special! ${nameA}'s move was overridden.`,
    };
  }

  if (actionA === 'attack' && actionB === 'attack') {
    return {
      rawDmgToA: atkB, rawDmgToB: atkA,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `⚔️ Both attacked — ${nameA} deals ${atkA}, ${nameB} deals ${atkB}.`,
    };
  }
  if (actionA === 'defend' && actionB === 'defend') {
    return { rawDmgToA: 0, rawDmgToB: 0, energyDeltaA: 0, energyDeltaB: 0, description: `🛡️ Both defended — a tense standoff!` };
  }
  if (actionA === 'charge' && actionB === 'charge') {
    return { rawDmgToA: 0, rawDmgToB: 0, energyDeltaA: 1, energyDeltaB: 1, description: `⚡ Both charged up energy!` };
  }

  // Attack vs Defend
  if (actionA === 'attack' && actionB === 'defend') {
    return {
      rawDmgToA: Math.round(atkB * 0.2), rawDmgToB: Math.round(atkA * 0.3),
      energyDeltaA: 0, energyDeltaB: 0,
      description: `🛡️ **${nameB}** defended! Blocked most of the blow and reflected ${Math.round(atkB * 0.2)} back.`,
    };
  }
  if (actionA === 'defend' && actionB === 'attack') {
    return {
      rawDmgToA: Math.round(atkB * 0.3), rawDmgToB: Math.round(atkA * 0.2),
      energyDeltaA: 0, energyDeltaB: 0,
      description: `🛡️ **${nameA}** defended! Blocked most of the blow and reflected ${Math.round(atkA * 0.2)} back.`,
    };
  }

  // Attack vs Charge
  if (actionA === 'attack' && actionB === 'charge') {
    return {
      rawDmgToA: 0, rawDmgToB: atkA, energyDeltaA: 0, energyDeltaB: 0,
      description: `⚔️ **${nameA}** struck ${nameB} mid-charge for full ${atkA} damage!`,
    };
  }
  if (actionA === 'charge' && actionB === 'attack') {
    return {
      rawDmgToA: atkB, rawDmgToB: 0, energyDeltaA: 0, energyDeltaB: 0,
      description: `⚔️ **${nameB}** struck ${nameA} mid-charge for full ${atkB} damage!`,
    };
  }

  // Charge vs Defend
  if (actionA === 'charge' && actionB === 'defend') {
    return { rawDmgToA: 0, rawDmgToB: 0, energyDeltaA: 1, energyDeltaB: 0, description: `⚡ **${nameA}** charged safely while ${nameB} held their guard.` };
  }
  if (actionA === 'defend' && actionB === 'charge') {
    return { rawDmgToA: 0, rawDmgToB: 0, energyDeltaA: 0, energyDeltaB: 1, description: `⚡ **${nameB}** charged safely while ${nameA} held their guard.` };
  }

  return { rawDmgToA: 0, rawDmgToB: 0, energyDeltaA: 0, energyDeltaB: 0, description: `Nothing happened.` };
}

// ── Type advantage description ────────────────────────────────────────────────
function typeAdvantageNote(fA, fB) {
  const multAonB = getTypeMultiplier(fA.type, fB.type);
  const multBonA = getTypeMultiplier(fB.type, fA.type);
  if (multAonB === 1.3) return `${WIN_EMOJI} ${TYPE_EMOJI[fA.type]} **${fA.type}** beats ${TYPE_EMOJI[fB.type]} ${fB.type}! (+30% dmg)`;
  if (multBonA === 1.3) return `${WIN_EMOJI} ${TYPE_EMOJI[fB.type]} **${fB.type}** beats ${TYPE_EMOJI[fA.type]} ${fA.type}! (+30% dmg)`;
  return null;
}

// ── Core duel resolver ────────────────────────────────────────────────────────
function resolveDuel(fighterA, fighterB) {
  const log = [];
  fighterA.energy = 0;
  fighterB.energy = 0;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const actionA = stanceAI(fighterA);
    const actionB = stanceAI(fighterB);

    const atkA     = effectiveAtk(fighterA);
    const atkB     = effectiveAtk(fighterB);
    const specAtkA = Math.round(atkA * fighterA.specialMult);
    const specAtkB = Math.round(atkB * fighterB.specialMult);

    const result = resolveMoves(actionA, actionB, atkA, atkB, specAtkA, specAtkB, fighterA.name, fighterB.name);

    // Apply type multipliers then DEF reduction
    const multAonB = getTypeMultiplier(fighterA.type, fighterB.type);
    const multBonA = getTypeMultiplier(fighterB.type, fighterA.type);
    const dmgToA = Math.max(0, Math.round(result.rawDmgToA * multBonA) - fighterA.def);
    const dmgToB = Math.max(0, Math.round(result.rawDmgToB * multAonB) - fighterB.def);

    fighterA.currentHp = Math.max(0, fighterA.currentHp - dmgToA);
    fighterB.currentHp = Math.max(0, fighterB.currentHp - dmgToB);

    const newEnergyA = fighterA.energy + result.energyDeltaA;
    const newEnergyB = fighterB.energy + result.energyDeltaB;
    fighterA.energy = Math.max(0, Math.min(ENERGY_MAX, newEnergyA));
    fighterB.energy = Math.max(0, Math.min(ENERGY_MAX, newEnergyB));

    const aWonTurn = dmgToB > dmgToA;
    const bWonTurn = dmgToA > dmgToB;
    fighterA._lastAction = actionA; fighterA._lastWon = aWonTurn;
    fighterB._lastAction = actionB; fighterB._lastWon = bWonTurn;

    log.push({
      turn, actionA, actionB, dmgToA, dmgToB,
      hpA: fighterA.currentHp, hpB: fighterB.currentHp,
      energyA: fighterA.energy, energyB: fighterB.energy,
      description: result.description,
      typeNote: dmgToA > 0 || dmgToB > 0 ? typeAdvantageNote(fighterA, fighterB) : null,
    });

    if (fighterA.currentHp <= 0 || fighterB.currentHp <= 0) break;
  }

  const aKO = fighterA.currentHp <= 0;
  const bKO = fighterB.currentHp <= 0;
  let winner;
  if (aKO && bKO) {
    winner = fighterA.atk >= fighterB.atk ? 'A' : 'B';
  } else if (aKO) {
    winner = 'B';
  } else if (bKO) {
    winner = 'A';
  } else {
    const pctA = fighterA.currentHp / fighterA.maxHp;
    const pctB = fighterB.currentHp / fighterB.maxHp;
    if (Math.abs(pctA - pctB) < 0.001) {
      winner = fighterA.atk >= fighterB.atk ? 'A' : 'B';
    } else {
      winner = pctA > pctB ? 'A' : 'B';
    }
  }

  return { winner, log, turns: log.length };
}

module.exports = {
  TYPES,
  TYPE_EMOJI,
  TYPE_COLOR,
  WIN_EMOJI,
  LOSE_EMOJI,
  TIER_EMOJI,
  parseCustomEmoji,
  TIER_REWARD_MULT,
  ENERGY_MAX,
  MAX_TURNS,
  MAX_LEVEL,
  LEVEL_EMOJI,
  LEVELUP_EMOJI,
  BOT_EMOJI,
  VS_EMOJI,
  getType,
  getTypeMultiplier,
  getTierStats,
  getLevelStats,
  xpToNextLevel,
  createFighter,
  resolveDuel,
  xpForOpponent,
  TIER_XP_BONUS,
  BASE_XP,
  MAX_XP,
  MIN_XP,
};
