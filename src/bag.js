// Adding items to $PokemonBag.
//
// @pockets is a fixed array of pocket arrays, each holding [item id, quantity]
// pairs. Index 0 is unused (mirrors the $game_switches/$game_variables
// convention - see indexedList() in views.js): PBS/items.txt numbers its
// Pocket field 1..8, and the save uses that same number as the array index.

import { RArray } from './marshal.js';
import { itemExists, itemPocket } from './gamedata.js';

const ivar = (o, n) => (o && o.ivars ? o.ivars.find(([k]) => k === n)?.[1] : undefined);

/** The highest quantity a single bag entry can hold, per the game's item screen. */
export const MAX_QUANTITY = 999;

function pocketArray(save, pocketIndex) {
  const pockets = ivar(save.section('bag'), '@pockets');
  if (!pockets || pockets.t !== 'array') throw new Error('this save has no bag pockets');
  const pocket = pockets.items[pocketIndex];
  if (!pocket || pocket.t !== 'array') throw new Error(`pocket ${pocketIndex} does not exist`);
  return pocket;
}

/**
 * Add `qty` of an item to the bag, in its PBS-declared pocket. Stacks onto a
 * matching entry already in that pocket, exactly like the game's own
 * pbAddItem, instead of creating a duplicate row.
 */
export function addItem(save, opts) {
  const item = Number(opts.item);
  if (!itemExists(item)) throw new Error(`item ${opts.item} does not exist`);

  const pocketIndex = itemPocket(item);
  if (!pocketIndex) throw new Error(`item ${item} has no known pocket`);
  const pocket = pocketArray(save, pocketIndex);

  const qty = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(opts.qty)) || 1));
  const existing = pocket.items.find((e) => e?.items?.[0] === item);
  if (existing) {
    existing.items[1] = Math.min(MAX_QUANTITY, (existing.items[1] || 0) + qty);
    return { pocket: pocketIndex, qty: existing.items[1], stacked: true };
  }
  pocket.items.push(RArray([item, qty]));
  return { pocket: pocketIndex, qty, stacked: false };
}
