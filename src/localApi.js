// Everything the old Node server used to do, running in the page instead.
// The UI calls `call(path, body)` exactly where it used to fetch `/api/...`,
// so the tab code did not need to change when the server went away.

import { Save } from './save.js';
import { children } from './save.js';
import * as views from './views.js';
import * as roster from './roster.js';
import * as bag from './bag.js';
import { optionsFor, labelCounts } from './labels.js';
import { SECTIONS } from './schema.js';
import { recalcStats, STAT_INPUTS } from './create.js';

const state = {
  save: null,
  /** bytes exactly as the user handed them to us, for Revert */
  originalBytes: null,
  dirty: false,
};

export function openBytes(name, bytes) {
  state.save = new Save(name, bytes);
  state.originalBytes = bytes;
  state.dirty = false;
  return views.summary(state.save);
}

export function hasSave() {
  return state.save !== null;
}

export function isDirty() {
  return state.dirty;
}

function need() {
  if (!state.save) throw new Error('open a save file first');
  return state.save;
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
    return { open: views.summary(state.save) };
  },

  /** Produce the edited bytes for download. */
  '/api/serialize': () => {
    const bytes = need().serialize();
    return { bytes, size: bytes.length, name: state.save.file };
  },

  '/api/markSaved': () => {
    state.dirty = false;
    return { ok: true };
  },

  '/api/variables': (b) => ({ rows: views.variables(need(), !!b.onlySet) }),
  '/api/switches': (b) => ({ rows: views.switches(need(), !!b.onlySet) }),
  '/api/trainer': () => views.trainer(need()),
  '/api/bag': () => ({ pockets: views.bag(need()) }),
  '/api/party': () => ({ party: views.party(need()) }),
  '/api/boxes': () => ({ boxes: views.boxes(need()) }),
  '/api/tree': (b) => ({ children: children(need(), b.path || []) }),
  '/api/options': (b) => ({ options: optionsFor(b.kind) }),

  '/api/set': (b) => {
    const s = need();
    const applied = s.set(b.path, b.value);
    state.dirty = true;
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
    const mon = s.get(b.path);
    const r = recalcStats(mon);
    state.dirty = true;
    return { ok: true, ...r };
  },

  '/api/pokemon/add': (b) => {
    const s = need();
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
    return { ...r, summary: views.summary(s) };
  },

  '/api/pokemon/remove': (b) => {
    const s = need();
    const r = b.where === 'party'
      ? roster.removeFromParty(s, Number(b.index))
      : roster.removeFromBox(s, Number(b.box), Number(b.slot));
    state.dirty = true;
    return { ...r, summary: views.summary(s) };
  },

  '/api/pokemon/move': (b) => {
    const s = need();
    const r = b.direction === 'toParty'
      ? roster.boxToParty(s, Number(b.box), Number(b.slot))
      : roster.partyToBox(s, Number(b.index), Number(b.box) || 0);
    state.dirty = true;
    return { ...r, summary: views.summary(s) };
  },

  '/api/item/add': (b) => {
    const s = need();
    const r = bag.addItem(s, { item: Number(b.item), qty: b.qty !== undefined ? Number(b.qty) : 1 });
    state.dirty = true;
    return { ...r, pockets: views.bag(s) };
  },
};

/** Same shape as the old fetch wrapper: resolves with data, throws on error. */
export async function call(path, body = {}) {
  const route = ROUTES[path];
  if (!route) throw new Error(`no such route: ${path}`);
  return route(body);
}
