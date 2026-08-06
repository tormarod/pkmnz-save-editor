// Adding and removing Pokemon from the party and the storage boxes.
//
// The two containers behave differently, and the game relies on it:
//   party  -> $Trainer.party, a compact array of at most 6, no holes
//   boxes  -> PokemonBox#@pokemon, exactly 30 fixed slots pre-filled with nil
// So a party removal splices, while a box removal writes nil back into the slot.

import {
  RArray, jsToStr, strToJs, getIvar as ivar, setIvar,
} from './marshal.js';
import { makePokemon } from './create.js';
import { nameOf } from './labels.js';
import { movePP } from './gamedata.js';

export const PARTY_MAX = 6;
export const BOX_SIZE = 30;

/** A move's max PP with PP Ups applied: mirrors PokeBattle_Move#totalpp (base * (5+ppup)/5). */
function maxPP(moveId, ppup) {
  return Math.floor(movePP(moveId) * (5 + (ppup || 0)) / 5);
}

function partyArray(save) {
  const tr = save.section('trainer');
  const p = ivar(tr, '@party');
  if (!p || p.t !== 'array') throw new Error('this save has no $Trainer.party array');
  return p;
}

function boxArray(save, boxIndex) {
  const boxes = ivar(save.section('storage'), '@boxes');
  if (!boxes || boxes.t !== 'array') throw new Error('this save has no storage boxes');
  const box = boxes.items[boxIndex];
  if (!box) throw new Error(`box ${boxIndex} does not exist (0..${boxes.items.length - 1})`);
  let mons = ivar(box, '@pokemon');
  if (!mons || mons.t !== 'array') throw new Error(`box ${boxIndex} has no @pokemon array`);
  // Boxes are created with a fixed number of nil slots; keep that invariant.
  while (mons.items.length < BOX_SIZE) mons.items.push(null);
  return { box, mons };
}

/** The OT details a newly created Pokemon should inherit from this save. */
export function trainerOf(save) {
  const tr = save.section('trainer');
  const id = ivar(tr, '@id');
  return {
    // @id is a Bignum in the save; only pass it through if it is a plain number
    id: typeof id === 'number' ? id : 0,
    name: strToJs(ivar(tr, '@name')) ?? '',
    gender: ivar(tr, '@gender') ?? 2,
    language: ivar(tr, '@language') ?? 7,
  };
}

function build(save, opts) {
  const speciesName = nameOf('species', opts.species);
  return makePokemon({
    ...opts,
    speciesName,
    trainer: opts.inheritOT === false ? undefined : trainerOf(save),
    obtainMap: opts.obtainMap ?? (typeof save.section('map_id') === 'number' ? save.section('map_id') : 0),
  });
}

/** Add a newly built Pokemon to the party. */
export function addToParty(save, opts) {
  const party = partyArray(save);
  if (party.items.length >= PARTY_MAX) {
    throw new Error(`the party is full (${PARTY_MAX}); send one to a box first`);
  }
  const mon = build(save, opts);
  party.items.push(mon);
  return { index: party.items.length - 1, count: party.items.length };
}

/** Add a newly built Pokemon to the first free slot of a box. */
export function addToBox(save, boxIndex, opts) {
  const { mons } = boxArray(save, boxIndex);
  let slot = mons.items.findIndex((m) => m === null || m === undefined);
  if (slot === -1) throw new Error(`box ${boxIndex + 1} is full`);
  mons.items[slot] = build(save, opts);
  return { box: boxIndex, slot, count: mons.items.filter(Boolean).length };
}

/** Add to the party if there is room, otherwise the first box with a free slot. */
export function addAnywhere(save, opts) {
  const party = partyArray(save);
  if (party.items.length < PARTY_MAX) return { where: 'party', ...addToParty(save, opts) };
  const boxes = ivar(save.section('storage'), '@boxes');
  for (let i = 0; i < boxes.items.length; i++) {
    try { return { where: 'box', ...addToBox(save, i, opts) }; } catch { /* full, try the next */ }
  }
  throw new Error('the party and every box are full');
}

export function removeFromParty(save, index) {
  const party = partyArray(save);
  if (index < 0 || index >= party.items.length) throw new Error(`no party slot ${index}`);
  party.items.splice(index, 1); // compact: no holes in the party
  return { count: party.items.length };
}

export function removeFromBox(save, boxIndex, slot) {
  const { mons } = boxArray(save, boxIndex);
  if (slot < 0 || slot >= mons.items.length) throw new Error(`no slot ${slot} in box ${boxIndex + 1}`);
  mons.items[slot] = null; // keep the slot, just empty it
  return { count: mons.items.filter(Boolean).length };
}

/** Move a Pokemon from a box into the party. */
export function boxToParty(save, boxIndex, slot) {
  const party = partyArray(save);
  if (party.items.length >= PARTY_MAX) throw new Error(`the party is full (${PARTY_MAX})`);
  const { mons } = boxArray(save, boxIndex);
  const mon = mons.items[slot];
  if (!mon) throw new Error(`box ${boxIndex + 1} slot ${slot + 1} is empty`);
  mons.items[slot] = null;
  party.items.push(mon);
  return { index: party.items.length - 1 };
}

/** Move a Pokemon from the party into a box. */
export function partyToBox(save, index, boxIndex) {
  const party = partyArray(save);
  const mon = party.items[index];
  if (!mon) throw new Error(`no party slot ${index}`);
  const { mons } = boxArray(save, boxIndex);
  const slot = mons.items.findIndex((m) => m === null || m === undefined);
  if (slot === -1) throw new Error(`box ${boxIndex + 1} is full`);
  mons.items[slot] = mon;
  party.items.splice(index, 1);
  return { box: boxIndex, slot };
}

/** Restore every party Pokemon to full HP, no status, and full move PP. */
export function healParty(save) {
  const party = partyArray(save);
  let healed = 0;
  for (const mon of party.items) {
    if (!mon || mon.t !== 'obj') continue;
    setIvar(mon, '@hp', ivar(mon, '@totalhp') ?? 0);
    setIvar(mon, '@status', 0);
    setIvar(mon, '@statusCount', 0);
    for (const m of ivar(mon, '@moves')?.items || []) {
      const id = ivar(m, '@id');
      if (!id) continue;
      setIvar(m, '@pp', maxPP(id, ivar(m, '@ppup')));
    }
    healed++;
  }
  return { healed };
}

/** Sort a box's occupied slots by species id, compacted to the front. */
export function sortBox(save, boxIndex) {
  const { mons } = boxArray(save, boxIndex);
  const filled = mons.items.filter(Boolean);
  filled.sort((a, b) => (ivar(a, '@species') ?? 0) - (ivar(b, '@species') ?? 0));
  for (let i = 0; i < mons.items.length; i++) mons.items[i] = filled[i] ?? null;
  return { count: filled.length };
}

export { RArray, jsToStr };
