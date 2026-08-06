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
  };
}

export function moveData(id) {
  const m = data().moves[id];
  return m ? { id, name: m.n, internal: m.i, totalpp: m.pp } : null;
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
