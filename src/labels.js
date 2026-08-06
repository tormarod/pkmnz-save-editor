// Turns bare numbers in a save into readable names, using the baked bundle.
// Every table originally came from the game install itself (Data/System.rxdata,
// Data/MapInfos.rxdata, PBS/*.txt), so the names always match the real game.

import { data } from './data.js';

const TABLES = ['variables', 'switches', 'maps', 'species', 'items', 'moves', 'abilities', 'trainerTypes'];

// Pokemon Essentials ships its default project with switches 14-30ish
// pre-named as reminders of common scripted conditions ("s:pbIsWeekday(...)",
// "s:PBDayNight.isMorning?", ...) and a run of slots explicitly blanked out
// as "----RESERVED-----". Neither is a real, currently-functional toggle:
// - "s:" names are read by nothing at runtime; they're notes telling the
//   event editor "use this script call in a conditional branch instead of a
//   plain switch". Flipping the switch itself does nothing in-game.
// - "RESERVED" slots are just blocked out for future use and nothing checks
//   them (yet). Editing them is harmless but has no visible effect.
const RESERVED_RE = /^-+\s*RESERVED\s*-+$/i;

/**
 * 'reserved' | 'computed' | null - what kind of non-functional name (if any)
 * this variable/switch has, so the UI can flag it instead of implying it is
 * an ordinary, game-read toggle.
 */
export function special(name) {
  if (!name) return null;
  if (RESERVED_RE.test(name)) return 'reserved';
  if (name.startsWith('s:')) return 'computed';
  return null;
}

/** Display name for an entry, whichever shape the table uses. */
function entryName(e) {
  if (e === undefined || e === null) return null;
  return typeof e === 'string' ? e : e.n || e.i || null;
}

export function labels() {
  const d = data();
  const out = {};
  for (const t of TABLES) out[t] = d[t] || {};
  return out;
}

/** Human name for a numeric id, or null when there is nothing to show. */
export function nameOf(kind, id) {
  if (id === null || id === undefined || id === 0) return null;
  const table = data()[kind];
  return table ? entryName(table[id]) : null;
}

/** Options for a dropdown or datalist: [{ id, label }], sorted by id. */
export function optionsFor(kind) {
  const table = data()[kind] || {};
  return Object.keys(table)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .map((id) => ({ id, label: `${id} - ${entryName(table[id])}` }));
}

/** Counts per table, for the "what got loaded" line in the UI. */
export function labelCounts() {
  const d = data();
  const out = {};
  for (const t of TABLES) out[t] = Object.keys(d[t] || {}).length;
  return out;
}
