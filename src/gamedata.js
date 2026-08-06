// Species and move facts needed to build a Pokemon the way the game would.
// Reads the baked bundle; the numbers in it came from Data/dexdata.dat and the
// level-up movesets from PBS/pokemon.txt. See tools/build-data.js.

import { data } from './data.js';

export function speciesCount() {
  return data().speciesCount;
}

export function speciesExists(id) {
  return Number.isInteger(id) && id >= 1 && !!data().species[id];
}

/**
 * One species record.
 *   baseStats  HP, Atk, Def, Spd, SpAtk, SpDef
 *   growthRate index into the experience table
 *   genderRate 0..253 female threshold, 254 always female, 255 genderless
 *   abilities  [first, second] ability ids; second is omitted if it doesn't have one
 *   hiddenAbility ability id, or 0 if it doesn't have one
 */
export function speciesData(id) {
  const s = data().species[id];
  if (!s) throw new Error(`species ${id} is out of range (1..${speciesCount()})`);
  return {
    id,
    name: s.n,
    internal: s.i,
    baseStats: s.bs,
    genderRate: s.gn,
    happiness: s.hp,
    growthRate: s.gr,
    baseExp: s.xp,
    levelMoves: s.lm,
    abilities: s.ab || [],
    hiddenAbility: s.ha || 0,
  };
}

/**
 * The ability id a Pokemon actually has: the forced @abilityflag override
 * (0 first, 1 second, 2 hidden) when set, otherwise the personal-ID-derived
 * choice between its first and second ability (PokeBattle_Pokemon#ability).
 */
export function resolveAbility(species, personalID, abilityFlag) {
  const sd = speciesData(species);
  if (abilityFlag === 0 || abilityFlag === 1 || abilityFlag === 2) {
    if (abilityFlag === 2) return sd.hiddenAbility || null;
    return sd.abilities[abilityFlag] || sd.abilities[0] || null;
  }
  const natural = sd.abilities[personalID % 2] || sd.abilities[0];
  return natural || null;
}

export function moveData(id) {
  const m = data().moves[id];
  return m ? { id, name: m.n, internal: m.i, totalpp: m.pp } : null;
}

export function itemExists(id) {
  return Number.isInteger(id) && id >= 1 && !!data().items[id];
}

/** The PBS internal name (e.g. "POKEBALL"), for matching against external icon sets. */
export function itemInternalName(id) {
  return data().items[id]?.i || null;
}

/** The bag pocket (1..N, matching items.txt's Pocket field) an item belongs in. */
export function itemPocket(id) {
  return data().items[id]?.pocket || null;
}

export function movePP(id) {
  return data().moves[id]?.pp ?? 5;
}

/**
 * The four moves the game gives a freshly created Pokemon: every level-up move
 * at or below `level`, de-duplicated, last four kept.
 * Mirrors PokeBattle_Pokemon#initialize.
 */
export function movesAtLevel(species, level) {
  const list = [];
  for (const [lvl, mid] of speciesData(species).levelMoves) {
    if (lvl <= level) list.push(mid);
  }
  const unique = [...new Set(list)];
  return unique.slice(Math.max(0, unique.length - 4));
}
