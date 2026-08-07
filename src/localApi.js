// Everything the old Node server used to do, running in the page instead.
// The UI calls `call(path, body)` exactly where it used to fetch `/api/...`,
// so the tab code did not need to change when the server went away.

import { Save } from './save.js';
import { children, preview } from './save.js';
import {
  RArray, strToJs, jsToStr, getIvar, setIvar,
} from './marshal.js';
import * as views from './views.js';
import * as roster from './roster.js';
import * as bag from './bag.js';
import { optionsFor, labelCounts, nameOf } from './labels.js';
import { SECTIONS } from './schema.js';
import {
  recalcStats, STAT_INPUTS, setContestStat, addRibbon, removeRibbon,
} from './create.js';
import { validate } from './validate.js';

const UNDO_LIMIT = 20;

const state = {
  save: null,
  /** bytes exactly as the user handed them to us, for Revert */
  originalBytes: null,
  dirty: false,
  /** human-readable "what will change" entries since the file was opened/saved */
  changes: [],
  undoStack: [],
  redoStack: [],
};

function resetHistory() {
  state.changes = [];
  state.undoStack = [];
  state.redoStack = [];
}

export function openBytes(name, bytes) {
  state.save = new Save(name, bytes);
  state.originalBytes = bytes;
  state.dirty = false;
  resetHistory();
  return views.summary(state.save);
}

export function hasSave() {
  return state.save !== null;
}

export function isDirty() {
  return state.dirty;
}

/** Swap in bytes from a restored draft, keeping the true opened file for Revert. */
export function restoreDraft(bytes) {
  const s = need();
  state.save = new Save(s.file, bytes);
  state.dirty = true;
  resetHistory();
  return views.summary(state.save);
}

function need() {
  if (!state.save) throw new Error('open a save file first');
  return state.save;
}

// --- undo/redo ---------------------------------------------------------------
// A simple linear stack of whole-tree snapshots. Individual save edits touch
// wildly different shapes (a scalar, an added Pokemon, a resorted box), so
// rather than modeling an inverse for every operation, snapshot-and-restore
// covers all of them uniformly and can never leave the tree in a state that
// doesn't match something the user actually had on screen.

function snapshot() {
  return { streams: structuredClone(state.save.streams), changes: structuredClone(state.changes) };
}

/** Call at the top of every mutating route, before touching the save. */
function pushUndo() {
  need();
  state.undoStack.push(snapshot());
  if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();
  state.redoStack.length = 0;
}

function applySnapshot(snap) {
  state.save.streams = snap.streams;
  state.changes = snap.changes;
  state.dirty = state.save.isDirty();
}

// --- change log ----------------------------------------------------------

function genericLabel(path) {
  return path.map((s) => {
    if (s.k === 'v') return s.name.replace(/^@/, '');
    if (s.k === 'i') return `[${s.i}]`;
    if (s.k === 's') return SECTIONS[s.i]?.name || `stream ${s.i}`;
    return s.k;
  }).join(' / ');
}

/**
 * Record a single field edit, collapsing repeat edits of the same path into one
 * entry. Keeps the original raw `before` value (never overwritten by a repeat
 * edit) so the persistent change panel can revert this one field precisely,
 * regardless of what else has changed since - see '/api/changes/revert'.
 */
function recordFieldChange(label, path, before, after) {
  const key = JSON.stringify(path);
  const beforeStr = preview(before);
  const afterStr = preview(after);
  const existing = state.changes.find((c) => c.key === key);
  if (existing) {
    existing.after = afterStr;
    if (existing.before === existing.after) state.changes = state.changes.filter((c) => c !== existing);
    return;
  }
  if (beforeStr === afterStr) return;
  state.changes.push({
    key, kind: 'field', path, desc: label || genericLabel(path), before: beforeStr, after: afterStr, beforeRaw: before,
  });
}

/**
 * Record a structural change (add/remove/move/bulk action) with no before/after
 * pair. Carries the whole-tree snapshot pushUndo() just took (i.e. the state
 * immediately before this action), so the panel can revert it by rewinding to
 * that point - which also discards any later changes, unlike a field revert.
 */
function recordChange(desc) {
  state.changes.push({
    key: `#${state.changes.length}:${Math.random()}`,
    kind: 'structural',
    desc,
    snapshot: state.undoStack[state.undoStack.length - 1] || null,
  });
}

function monLabel(mon) {
  if (!mon) return 'a Pokémon';
  const nick = strToJs(getIvar(mon, '@name'));
  const species = getIvar(mon, '@species');
  return nick || nameOf('species', species) || (species ? `species ${species}` : 'a Pokémon');
}

/**
 * After editing a value, if it sits inside a Pokemon and feeds into its stats,
 * recompute that Pokemon's cached stats. Returns true when it did.
 *
 * Walks back from the edited path to the nearest enclosing PokeBattle_Pokemon,
 * so it works for the Party tab and the raw tree alike.
 */
function recalcEnclosingPokemon(save, path) {
  for (let i = path.length - 1; i >= 0; i--) {
    const prefix = path.slice(0, i);
    let node;
    try { node = save.get(prefix); } catch { continue; }
    if (!node || node.t !== 'obj' || node.cls !== 'PokeBattle_Pokemon') continue;

    // path[i] is the ivar of the Pokemon that was touched (directly or deeper)
    const step = path[i];
    if (step.k !== 'v' || !STAT_INPUTS.includes(step.name)) return false;
    recalcStats(node);
    return true;
  }
  return false;
}

const ROUTES = {
  '/api/state': () => ({
    sections: SECTIONS,
    labels: labelCounts(),
    open: state.save ? views.summary(state.save) : null,
    dirty: state.dirty,
  }),

  '/api/summary': () => views.summary(need()),

  '/api/reload': () => {
    state.save = new Save(state.save.file, state.originalBytes);
    state.dirty = false;
    resetHistory();
    return { open: views.summary(state.save) };
  },

  /** Produce the edited bytes for download. */
  '/api/serialize': () => {
    const bytes = need().serialize();
    return { bytes, size: bytes.length, name: state.save.file };
  },

  /** The untouched bytes exactly as the user handed them to us, for a backup download. */
  '/api/backup': () => {
    need();
    return { bytes: state.originalBytes, size: state.originalBytes.length, name: state.save.file };
  },

  '/api/markSaved': () => {
    state.dirty = false;
    state.changes = [];
    return { ok: true };
  },

  '/api/changes': () => ({ changes: state.changes }),

  /**
   * Revert a single entry from the persistent change panel. A field edit reverts
   * exactly and independently of order (its own path, its own original value -
   * see recordFieldChange). A structural entry (add/remove/move/bulk action) has
   * no generic inverse, so it rewinds the whole tree to the snapshot taken right
   * before it happened; if later changes exist, the caller must pass `confirmed`
   * since those are lost too (`needsConfirm`/`laterCount` let the UI ask first).
   */
  '/api/changes/revert': (b) => {
    const s = need();
    const entry = state.changes.find((c) => c.key === b.key);
    if (!entry) throw new Error('that change is no longer in the list');
    if (entry.kind === 'field') {
      pushUndo();
      try {
        s.locate(entry.path).set(entry.beforeRaw);
      } catch (e) {
        throw new Error(`could not revert - the surrounding data has changed since: ${e.message}`);
      }
      state.changes = state.changes.filter((c) => c !== entry);
      state.dirty = s.isDirty();
      return { ok: true, dirty: state.dirty, changes: state.changes };
    }
    if (!entry.snapshot) throw new Error('this change is too old to revert directly - use Undo instead');
    const idx = state.changes.indexOf(entry);
    const laterCount = state.changes.length - idx - 1;
    if (laterCount > 0 && !b.confirmed) return { needsConfirm: true, laterCount };
    pushUndo();
    state.save.streams = structuredClone(entry.snapshot.streams);
    state.changes = structuredClone(entry.snapshot.changes);
    state.dirty = s.isDirty();
    return { ok: true, dirty: state.dirty, changes: state.changes };
  },

  '/api/validate': () => ({ warnings: validate(need()) }),

  '/api/undoState': () => ({ canUndo: state.undoStack.length > 0, canRedo: state.redoStack.length > 0 }),

  '/api/undo': () => {
    const s = need();
    if (!state.undoStack.length) throw new Error('nothing to undo');
    state.redoStack.push(snapshot());
    if (state.redoStack.length > UNDO_LIMIT) state.redoStack.shift();
    applySnapshot(state.undoStack.pop());
    return { open: views.summary(s), dirty: state.dirty };
  },

  '/api/redo': () => {
    const s = need();
    if (!state.redoStack.length) throw new Error('nothing to redo');
    state.undoStack.push(snapshot());
    applySnapshot(state.redoStack.pop());
    return { open: views.summary(s), dirty: state.dirty };
  },

  '/api/variables': (b) => ({ rows: views.variables(need(), !!b.onlySet) }),
  '/api/switches': (b) => ({ rows: views.switches(need(), !!b.onlySet) }),
  '/api/trainer': () => views.trainer(need()),
  '/api/world': () => views.world(need()),
  '/api/player': () => views.player(need()),
  '/api/dex': () => ({ rows: views.dex(need()) }),

  '/api/dex/markAll': (b) => {
    const s = need();
    const which = b.which === 'owned' ? '@owned' : b.which === 'seen' ? '@seen' : null;
    if (!which) throw new Error(`unknown dex flag '${b.which}'`);
    pushUndo();
    const arr = getIvar(s.section('trainer'), which);
    if (!arr || arr.t !== 'array') throw new Error(`this save has no ${which} array`);
    let count = 0;
    for (let i = 1; i < arr.items.length; i++) {
      if (arr.items[i] !== true) { arr.items[i] = true; count++; }
    }
    state.dirty = true;
    if (count) recordChange(`Marked all species as ${which === '@seen' ? 'seen' : 'owned'} (${count} newly marked)`);
    return { count, rows: views.dex(s) };
  },
  '/api/settings': () => views.options(need()),
  '/api/bag': () => ({ pockets: views.bag(need()) }),
  '/api/party': () => ({ party: views.party(need()) }),
  '/api/boxes': () => ({ boxes: views.boxes(need()) }),
  '/api/tree': (b) => ({ children: children(need(), b.path || []) }),
  '/api/options': (b) => ({ options: optionsFor(b.kind) }),

  '/api/set': (b) => {
    const s = need();
    pushUndo();
    const before = s.get(b.path);
    const applied = s.set(b.path, b.value);
    state.dirty = true;
    recordFieldChange(b.label, b.path, before, applied);
    // A Pokemon's six stats are cached in the save and the game reads them
    // straight back, so editing IVs/EVs/level/species has to recompute them or
    // the change is invisible in game.
    const recalculated = recalcEnclosingPokemon(s, b.path);
    return {
      ok: true,
      recalculated,
      applied: applied === null ? 'nil' : String(applied?.t ? '(object)' : applied),
    };
  },

  '/api/pokemon/recalc': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    const r = recalcStats(mon);
    state.dirty = true;
    return { ok: true, ...r };
  },

  '/api/pokemon/maxIVs': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    if (!mon || mon.t !== 'obj') throw new Error('not a Pokemon');
    setIvar(mon, '@iv', RArray([31, 31, 31, 31, 31, 31]));
    const r = recalcStats(mon);
    state.dirty = true;
    recordChange(`Maxed IVs for ${monLabel(mon)}`);
    return { ok: true, ...r };
  },

  // The four override flags (@shinyflag/@genderflag/@abilityflag/@natureflag)
  // are nil-by-default and often simply absent from the ivar list, so they
  // can't go through the generic /api/set (which requires the ivar to
  // already exist) - this creates it on first use instead.
  '/api/pokemon/setFlag': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    if (!mon || mon.t !== 'obj') throw new Error('not a Pokemon');
    if (!views.OVERRIDE_FLAGS.includes(b.ivar)) throw new Error(`not an overridable flag: ${b.ivar}`);
    const before = getIvar(mon, b.ivar) ?? null;
    const value = b.value === undefined ? null : b.value;
    setIvar(mon, b.ivar, value);
    state.dirty = true;
    recordFieldChange(b.label, [...b.path, { k: 'v', name: b.ivar }], before, value);
    const recalculated = b.ivar === '@natureflag';
    if (recalculated) recalcStats(mon);
    return { ok: true, recalculated };
  },

  '/api/pokemon/contest': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    const before = mon?.ivars?.find(([k]) => k === b.ivar)?.[1] ?? null;
    const value = setContestStat(mon, b.ivar, b.value);
    state.dirty = true;
    recordFieldChange(`${monLabel(mon)}: ${b.ivar.replace(/^@/, '')}`, [...b.path, { k: 'v', name: b.ivar }], before, value);
    return { ok: true, value };
  },

  '/api/pokemon/ribbons/add': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    const ribbons = addRibbon(mon, b.ribbon);
    state.dirty = true;
    recordChange(`Added ribbon ${Number(b.ribbon)} to ${monLabel(mon)}`);
    return { ok: true, ribbons };
  },

  '/api/pokemon/ribbons/remove': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    const ribbons = removeRibbon(mon, b.ribbon);
    state.dirty = true;
    recordChange(`Removed ribbon ${Number(b.ribbon)} from ${monLabel(mon)}`);
    return { ok: true, ribbons };
  },

  '/api/pokemon/add': (b) => {
    const s = need();
    pushUndo();
    const opts = {
      species: Number(b.species),
      level: Number(b.level),
      nickname: b.nickname || undefined,
      item: b.item ? Number(b.item) : 0,
      iv: Array.isArray(b.iv) && b.iv.length === 6 ? b.iv.map(Number) : undefined,
      ev: Array.isArray(b.ev) && b.ev.length === 6 ? b.ev.map(Number) : undefined,
      moves: Array.isArray(b.moves) ? b.moves.map(Number).filter(Boolean) : undefined,
      shiny: b.shiny === true ? true : b.shiny === false ? false : undefined,
      gender: b.gender ?? undefined,
      nature: b.nature ?? undefined,
      ability: b.ability ?? undefined,
      happiness: b.happiness ?? undefined,
      ball: b.ball ? Number(b.ball) : 0,
      egg: b.egg === true,
    };
    let r;
    if (b.target === 'party') r = { where: 'party', ...roster.addToParty(s, opts) };
    else if (b.target === 'box') r = { where: 'box', ...roster.addToBox(s, Number(b.box) || 0, opts) };
    else r = roster.addAnywhere(s, opts);
    state.dirty = true;
    const label = opts.nickname || nameOf('species', opts.species) || `species ${opts.species}`;
    const dest = r.where === 'party' ? `party slot ${r.index + 1}` : `box ${r.box + 1} slot ${r.slot + 1}`;
    recordChange(`Added ${label} (Lv. ${opts.level}) to ${dest}`);
    return { ...r, summary: views.summary(s) };
  },

  '/api/pokemon/remove': (b) => {
    const s = need();
    pushUndo();
    const mon = b.where === 'party'
      ? views.party(s)[Number(b.index)]
      : views.boxes(s).find((x) => x.index === Number(b.box))?.pokemon.find((m) => m.slot === Number(b.slot));
    const label = mon?.nickname || mon?.speciesName || 'a Pokémon';
    const r = b.where === 'party'
      ? roster.removeFromParty(s, Number(b.index))
      : roster.removeFromBox(s, Number(b.box), Number(b.slot));
    state.dirty = true;
    const from = b.where === 'party' ? `party slot ${Number(b.index) + 1}` : `box ${Number(b.box) + 1}`;
    recordChange(`Removed ${label} from ${from}`);
    return { ...r, summary: views.summary(s) };
  },

  '/api/pokemon/move': (b) => {
    const s = need();
    pushUndo();
    const mon = b.direction === 'toParty'
      ? views.boxes(s).find((x) => x.index === Number(b.box))?.pokemon.find((m) => m.slot === Number(b.slot))
      : views.party(s)[Number(b.index)];
    const label = mon?.nickname || mon?.speciesName || 'a Pokémon';
    const r = b.direction === 'toParty'
      ? roster.boxToParty(s, Number(b.box), Number(b.slot))
      : roster.partyToBox(s, Number(b.index), Number(b.box) || 0);
    state.dirty = true;
    recordChange(b.direction === 'toParty' ? `Moved ${label} to the party` : `Moved ${label} to box ${(Number(b.box) || 0) + 1}`);
    return { ...r, summary: views.summary(s) };
  },

  '/api/party/swap': (b) => {
    const s = need();
    pushUndo();
    const party = views.party(s);
    const a = Number(b.a);
    const bb = Number(b.b);
    const labelA = party[a]?.nickname || party[a]?.speciesName || `slot ${a + 1}`;
    const labelB = party[bb]?.nickname || party[bb]?.speciesName || `slot ${bb + 1}`;
    roster.swapParty(s, a, bb);
    state.dirty = true;
    recordChange(`Swapped party order of ${labelA} and ${labelB}`);
    return { party: views.party(s) };
  },

  '/api/pokemon/moves/learn': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    const id = roster.learnMove(mon, Number(b.moveId));
    state.dirty = true;
    recordChange(`Taught ${monLabel(mon)} ${nameOf('moves', id) || `move ${id}`}`);
    return { ok: true };
  },

  '/api/pokemon/moves/forget': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    const id = roster.forgetMove(mon, Number(b.slot));
    state.dirty = true;
    recordChange(`${monLabel(mon)} forgot ${nameOf('moves', id) || 'a move'}`);
    return { ok: true };
  },

  '/api/pokemon/moves/restorePP': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    roster.restoreMovePP(mon);
    state.dirty = true;
    recordChange(`Restored PP for ${monLabel(mon)}`);
    return { ok: true };
  },

  '/api/pokemon/moves/relearn': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    roster.relearnMoves(mon);
    state.dirty = true;
    recordChange(`Reset ${monLabel(mon)}'s moves to the level-up set`);
    return { ok: true };
  },

  '/api/pokemon/hatch': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    roster.hatchEgg(mon);
    state.dirty = true;
    recordChange(`Hatched ${monLabel(mon)}`);
    return { ok: true };
  },

  '/api/party/heal': () => {
    const s = need();
    pushUndo();
    const r = roster.healParty(s);
    state.dirty = true;
    recordChange(`Healed the party (${r.healed} Pokémon: HP, status and PP restored)`);
    return { ...r, party: views.party(s) };
  },

  '/api/party/rareCandy': (b) => {
    const s = need();
    pushUndo();
    const r = roster.setPartyLevel(s, b.level);
    state.dirty = true;
    if (r.count) recordChange(`Set the whole party to level ${r.level} (${r.count} Pokémon)`);
    return { ...r, party: views.party(s) };
  },

  '/api/pokemon/setEVs': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    roster.setEVs(mon, b.evs);
    const r = recalcStats(mon);
    state.dirty = true;
    recordChange(`Set EVs for ${monLabel(mon)}`);
    return { ok: true, ...r };
  },

  '/api/pokemon/maxHappiness': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    roster.maxHappiness(mon);
    state.dirty = true;
    recordChange(`Maxed happiness for ${monLabel(mon)}`);
    return { ok: true };
  },

  '/api/pokemon/maxPPUps': (b) => {
    const s = need();
    pushUndo();
    const mon = s.get(b.path);
    roster.maxPPUps(mon);
    state.dirty = true;
    recordChange(`Maxed PP Ups for ${monLabel(mon)}`);
    return { ok: true };
  },

  '/api/box/setField': (b) => {
    const s = need();
    pushUndo();
    if (!['@name', '@background'].includes(b.field)) throw new Error(`unknown box field '${b.field}'`);
    const boxes = getIvar(s.section('storage'), '@boxes');
    const box = boxes?.items?.[Number(b.box)];
    if (!box || box.t !== 'obj') throw new Error(`box ${Number(b.box) + 1} does not exist`);
    const value = b.field === '@name' ? jsToStr(String(b.value ?? '')) : (Math.floor(Number(b.value)) || 0);
    setIvar(box, b.field, value);
    state.dirty = true;
    recordChange(b.field === '@name'
      ? `Renamed box ${Number(b.box) + 1} to "${b.value}"`
      : `Set box ${Number(b.box) + 1}'s wallpaper to ${value}`);
    return { ok: true, boxes: views.boxes(s) };
  },

  '/api/box/sort': (b) => {
    const s = need();
    pushUndo();
    const r = roster.sortBox(s, Number(b.box));
    state.dirty = true;
    recordChange(`Sorted box ${Number(b.box) + 1} by species`);
    return { ...r, boxes: views.boxes(s) };
  },

  '/api/item/add': (b) => {
    const s = need();
    pushUndo();
    const r = bag.addItem(s, { item: Number(b.item), qty: b.qty !== undefined ? Number(b.qty) : 1 });
    state.dirty = true;
    const name = nameOf('items', Number(b.item)) || `item ${b.item}`;
    const qty = b.qty ?? 1;
    recordChange(r.stacked ? `Added ${qty}x ${name} to the bag (now have ${r.qty})` : `Added ${qty}x ${name} to the bag`);
    return { ...r, pockets: views.bag(s) };
  },

  '/api/item/remove': (b) => {
    const s = need();
    pushUndo();
    const before = views.bag(s).find((p) => p.pocket === Number(b.pocket))
      ?.items.find((it) => it.index === Number(b.index));
    const name = before ? (before.name || `item ${before.id}`) : 'item';
    bag.removeItem(s, Number(b.pocket), Number(b.index));
    state.dirty = true;
    recordChange(`Removed ${before ? `${before.qty}x ` : ''}${name} from the bag`);
    return { pockets: views.bag(s) };
  },

  '/api/bag/maxPocket': (b) => {
    const s = need();
    pushUndo();
    const r = bag.maxPocket(s, Number(b.pocket));
    state.dirty = true;
    if (r.count) recordChange(`Maxed the quantity of ${r.count} item${r.count === 1 ? '' : 's'} in pocket ${Number(b.pocket)}`);
    return { ...r, pockets: views.bag(s) };
  },

  '/api/bag/giveSet': (b) => {
    const s = need();
    pushUndo();
    const qty = b.qty !== undefined ? Number(b.qty) : 1;
    const r = bag.giveSet(s, Number(b.pocket), qty);
    state.dirty = true;
    if (r.count) recordChange(`Gave ${qty}x of every item in pocket ${Number(b.pocket)} (${r.count} items)`);
    return { ...r, pockets: views.bag(s) };
  },
};

/** Same shape as the old fetch wrapper: resolves with data, throws on error. */
export async function call(path, body = {}) {
  const route = ROUTES[path];
  if (!route) throw new Error(`no such route: ${path}`);
  return route(body);
}
