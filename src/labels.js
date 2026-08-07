// Turns bare numbers in a save into readable names, using the baked bundle.
// Every table originally came from the game install itself (Data/System.rxdata,
// Data/MapInfos.rxdata, PBS/*.txt), so the names always match the real game.

import { data } from './data.js';

const TABLES = ['variables', 'switches', 'maps', 'species', 'items', 'moves', 'abilities', 'trainerTypes', 'types'];

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
 * Tags for one variable/switch: 'script', 'dead', 'wide', 'inverted',
 * 'reserved', 'computed'. The bundle works these out at build time from the
 * game's own scripts and events; the name-based fallback is here so a bundle
 * built before annotations still flags the two obvious cases.
 */
export function tagsOf(kind, id) {
  const e = data()[kind]?.[id];
  if (!e) return [];
  if (typeof e !== 'string' && e.tag) return e.tag;
  const name = entryName(e) || '';
  if (RESERVED_RE.test(name)) return ['reserved'];
  if (name.startsWith('s:')) return ['computed'];
  return [];
}

/** Display name for an entry, whichever shape the table uses. */
function entryName(e) {
  if (e === undefined || e === null) return null;
  return typeof e === 'string' ? e : e.n || e.i || null;
}

/**
 * The whole bundle entry for a variable/switch - `{ n, g, es, en, tag, m, mc }`
 * - or an empty object. Used by the Game state tab, which needs the group and
 * the description as well as the name.
 */
export function entryOf(kind, id) {
  const e = data()[kind]?.[id];
  return e && typeof e === 'object' ? e : {};
}

/** Group metadata baked into the bundle: `{ key: { es, en, story } }`. */
export const groupInfo = () => data().groups || {};

/** Group keys in the order the cards should appear. */
export const groupOrder = () => data().groupOrder || [];

/** Group keys whose cards start expanded. */
export const groupsOpen = () => data().groupsOpen || [];

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
