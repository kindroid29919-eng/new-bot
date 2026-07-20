/**
 * battleEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared combat core used by both x!duel (1v1) and x!warfare (3v3).
 *
 *  • Elemental type system  — computed from character_id % 5, never stored
 *  • Stat formula           — HP / ATK derived from tier
 *  • Stance AI              — four stances that drive every turn decision
 *  • resolveDuel()          — runs a full match and returns the turn log
 *  • resolveMoves()         — single-turn outcome given two actions
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Elemental type system ─────────────────────────────────────────────────────
const TYPES      = ['Fire', 'Water', 'Wind', 'Light', 'Dark'];
const TYPE_EMOJI = { Fire: '🔥', Water: '💧', Wind: '🌪️', Light: '✨', Dark: '🌑' };
const TYPE_COLOR = { Fire: '#ff4757', Water: '#2e86de', Wind: '#26de81', Light: '#ffd32a', Dark: '#a55eea' };

// Pentagon advantage cycle: Fire→Wind→Light→Dark→Water→Fire
const BEATS = { Fire: 'Wind', Wind: 'Light', Light: 'Dark', Dark: 'Water', Water: 'Fire' };

function getType(characterId) {
  return TYPES[Math.abs(characterId) % 5];
}

/** Returns 1.3 (advantage), 0.7 (disadvantage), or 1.0 (neutral). */
function getTypeMultiplier(attackerType, defenderType) {
  if (BEATS[attackerType] === defenderType) return 1.3;
  if (BEATS[defenderType] === attackerType) return 0.7;
  return 1.0;
}

// ── Tier stats ────────────────────────────────────────────────────────────────
const TIER_BONUS = { Legendary: 150, Epic: 90, Rare: 50, Uncommon: 20, Common: 0 };
const TIER_EMOJI = { Legendary: '🌟', Epic: '💎', Rare: '🔥', Uncommon: '✨', Common: '⚪' };
const TIER_REWARD_MULT = { Legendary: 2.5, Epic: 2.0, Rare: 1.6, Uncommon: 1.3, Common: 1.0 };

function getTierStats(tier) {
  const bonus = TIER_BONUS[tier] ?? 0;
  return {
    hp:  100 + bonus,
    atk: 10 + Math.floor(bonus / 5),
  };
}

// ── Fighter factory ───────────────────────────────────────────────────────────
/**
 * Build a fighter object from a DB harem row + a chosen stance.
 * @param {string} userId
 * @param {object} haremRow  — DB row with character_id, character_name, tier, image_url, etc.
 * @param {string} stance    — 'Aggressive' | 'Defensive' | 'Balanced' | 'Berserker'
 */
function createFighter(userId, haremRow, stance = 'Aggressive') {
  const stats = getTierStats(haremRow.tier);
  const type  = getType(haremRow.character_id);
  return {
    userId,
    name:     haremRow.character_name,
    tier:     haremRow.tier,
    imageUrl: haremRow.image_url ?? null,
    haremId:  haremRow.id,
    characterId: haremRow.character_id,
    type,
    stance,
    maxHp:     stats.hp,
    currentHp: stats.hp,
    atk:       stats.atk,
    energy:    0,
    // Internal tracking for stances
    _lastAction: null,
    _lastWon:    null,
  };
}

const ENERGY_MAX = 3;
const MAX_TURNS  = 15;

// ── Stance AI ─────────────────────────────────────────────────────────────────
/**
 * Pick the next action for a fighter based on its stance and history.
 * @param {object} fighter  — fighter state (mutated in-place during resolveDuel)
 * @returns {'attack'|'defend'|'charge'|'special'}
 */
function stanceAI(fighter) {
  const { stance, energy, _lastAction, _lastWon } = fighter;

  switch (stance) {
    case 'Aggressive':
      return 'attack';

    case 'Defensive':
      if (energy >= ENERGY_MAX) return 'special';
      return 'defend';

    case 'Balanced': {
      if (_lastAction === null) return 'attack'; // first turn
      if (_lastWon) return _lastAction;          // won → repeat same
      // lost → switch to a different move
      if (_lastAction === 'attack') return 'charge';
      if (_lastAction === 'charge') return energy >= ENERGY_MAX ? 'special' : 'attack';
      if (_lastAction === 'special') return 'attack';
      return 'attack';
    }

    case 'Berserker':
      // Always attacks; effective ATK is boosted externally when resolving
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
 * @param {string} actionA
 * @param {string} actionB
 * @param {number} atkA  effective ATK for fighter A
 * @param {number} atkB  effective ATK for fighter B
 * @param {string} nameA
 * @param {string} nameB
 * @returns {{ rawDmgToA, rawDmgToB, energyDeltaA, energyDeltaB, description }}
 *   rawDmg values are BEFORE type-multiplier application (done in resolveDuel).
 */
function resolveMoves(actionA, actionB, atkA, atkB, nameA, nameB) {
  // Both Special
  if (actionA === 'special' && actionB === 'special') {
    return {
      rawDmgToA: Math.round(atkB * 1.5),
      rawDmgToB: Math.round(atkA * 1.5),
      energyDeltaA: -ENERGY_MAX, energyDeltaB: -ENERGY_MAX,
      description: `💥 Both unleashed their Specials!`,
    };
  }
  if (actionA === 'special') {
    return {
      rawDmgToA: 0, rawDmgToB: Math.round(atkA * 1.5),
      energyDeltaA: -ENERGY_MAX, energyDeltaB: 0,
      description: `✨ **${nameA}** unleashed a Special! ${nameB}'s move was overridden.`,
    };
  }
  if (actionB === 'special') {
    return {
      rawDmgToA: Math.round(atkB * 1.5), rawDmgToB: 0,
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
    return {
      rawDmgToA: 0, rawDmgToB: 0,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `🛡️ Both defended — a tense standoff!`,
    };
  }
  if (actionA === 'charge' && actionB === 'charge') {
    return {
      rawDmgToA: 0, rawDmgToB: 0,
      energyDeltaA: 1, energyDeltaB: 1,
      description: `⚡ Both charged up energy!`,
    };
  }

  // Attack vs Defend — attacker deals 30%, defender reflects 20%
  if (actionA === 'attack' && actionB === 'defend') {
    return {
      rawDmgToA: Math.round(atkB * 0.2),
      rawDmgToB: Math.round(atkA * 0.3),
      energyDeltaA: 0, energyDeltaB: 0,
      description: `🛡️ **${nameB}** defended! Blocked most of the blow and reflected ${Math.round(atkB * 0.2)} back.`,
    };
  }
  if (actionA === 'defend' && actionB === 'attack') {
    return {
      rawDmgToA: Math.round(atkB * 0.3),
      rawDmgToB: Math.round(atkA * 0.2),
      energyDeltaA: 0, energyDeltaB: 0,
      description: `🛡️ **${nameA}** defended! Blocked most of the blow and reflected ${Math.round(atkA * 0.2)} back.`,
    };
  }

  // Attack vs Charge — attacker interrupts, full damage, charger gets NO energy
  if (actionA === 'attack' && actionB === 'charge') {
    return {
      rawDmgToA: 0, rawDmgToB: atkA,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `⚔️ **${nameA}** struck ${nameB} mid-charge for full ${atkA} damage!`,
    };
  }
  if (actionA === 'charge' && actionB === 'attack') {
    return {
      rawDmgToA: atkB, rawDmgToB: 0,
      energyDeltaA: 0, energyDeltaB: 0,
      description: `⚔️ **${nameB}** struck ${nameA} mid-charge for full ${atkB} damage!`,
    };
  }

  // Charge vs Defend — safe energy gain
  if (actionA === 'charge' && actionB === 'defend') {
    return {
      rawDmgToA: 0, rawDmgToB: 0,
      energyDeltaA: 1, energyDeltaB: 0,
      description: `⚡ **${nameA}** charged safely while ${nameB} held their guard.`,
    };
  }
  if (actionA === 'defend' && actionB === 'charge') {
    return {
      rawDmgToA: 0, rawDmgToB: 0,
      energyDeltaA: 0, energyDeltaB: 1,
      description: `⚡ **${nameB}** charged safely while ${nameA} held their guard.`,
    };
  }

  // Fallback (shouldn't happen)
  return { rawDmgToA: 0, rawDmgToB: 0, energyDeltaA: 0, energyDeltaB: 0, description: `Nothing happened.` };
}

// ── Type advantage description ────────────────────────────────────────────────
function typeAdvantageNote(fA, fB) {
  const multAonB = getTypeMultiplier(fA.type, fB.type);
  const multBonA = getTypeMultiplier(fB.type, fA.type);
  if (multAonB === 1.3) return `🔺 ${TYPE_EMOJI[fA.type]} **${fA.type}** beats ${TYPE_EMOJI[fB.type]} ${fB.type}! (+30% dmg)`;
  if (multBonA === 1.3) return `🔺 ${TYPE_EMOJI[fB.type]} **${fB.type}** beats ${TYPE_EMOJI[fA.type]} ${fA.type}! (+30% dmg)`;
  return null;
}

// ── Core duel resolver ────────────────────────────────────────────────────────
/**
 * Run a full match between two fighters and return the complete turn log.
 * Mutates `fighterA` and `fighterB` HP/energy in-place so carry-over works in
 * warfare (the winner keeps their remaining stats for the next round).
 *
 * @param {object} fighterA   — created with createFighter()
 * @param {object} fighterB
 * @returns {{ winner: 'A'|'B', log: TurnLogEntry[], turns: number }}
 */
function resolveDuel(fighterA, fighterB) {
  const log = [];
  // Reset energy each match (not carried from previous rounds)
  fighterA.energy = 0;
  fighterB.energy = 0;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const actionA = stanceAI(fighterA);
    const actionB = stanceAI(fighterB);

    const atkA = effectiveAtk(fighterA);
    const atkB = effectiveAtk(fighterB);

    const result = resolveMoves(actionA, actionB, atkA, atkB, fighterA.name, fighterB.name);

    // Apply type multipliers to raw damage
    const multAonB = getTypeMultiplier(fighterA.type, fighterB.type);
    const multBonA = getTypeMultiplier(fighterB.type, fighterA.type);
    const dmgToA = Math.round(result.rawDmgToA * multBonA);
    const dmgToB = Math.round(result.rawDmgToB * multAonB);

    fighterA.currentHp = Math.max(0, fighterA.currentHp - dmgToA);
    fighterB.currentHp = Math.max(0, fighterB.currentHp - dmgToB);

    // Update energy (clamp, handle special energy drain)
    const newEnergyA = fighterA.energy + result.energyDeltaA;
    const newEnergyB = fighterB.energy + result.energyDeltaB;
    fighterA.energy = Math.max(0, Math.min(ENERGY_MAX, newEnergyA));
    fighterB.energy = Math.max(0, Math.min(ENERGY_MAX, newEnergyB));

    // Track Balanced stance history
    const aWonTurn = dmgToB > dmgToA;
    const bWonTurn = dmgToA > dmgToB;
    fighterA._lastAction = actionA;
    fighterA._lastWon    = aWonTurn;
    fighterB._lastAction = actionB;
    fighterB._lastWon    = bWonTurn;

    log.push({
      turn, actionA, actionB,
      dmgToA, dmgToB,
      hpA: fighterA.currentHp, hpB: fighterB.currentHp,
      energyA: fighterA.energy, energyB: fighterB.energy,
      description: result.description,
      typeNote: dmgToA > 0 || dmgToB > 0 ? typeAdvantageNote(fighterA, fighterB) : null,
    });

    if (fighterA.currentHp <= 0 || fighterB.currentHp <= 0) break;
  }

  // Determine winner
  const aKO = fighterA.currentHp <= 0;
  const bKO = fighterB.currentHp <= 0;
  let winner;
  if (aKO && bKO) {
    winner = fighterA.atk >= fighterB.atk ? 'A' : 'B'; // ATK tiebreak
  } else if (aKO) {
    winner = 'B';
  } else if (bKO) {
    winner = 'A';
  } else {
    // Turn cap — higher HP% wins
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
  BEATS,
  TIER_EMOJI,
  TIER_REWARD_MULT,
  ENERGY_MAX,
  MAX_TURNS,
  getType,
  getTypeMultiplier,
  getTierStats,
  createFighter,
  resolveDuel,
};
