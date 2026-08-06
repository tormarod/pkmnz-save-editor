// Cross-cutting plumbing every tab module builds on: the API call wrapper,
// toasts, the dirty flag and undo buttons, draft persistence, the shared
// options caches, and the generic path-bound input factory (boundInput).
//
// Tab modules (src/ui/tabs/*.js) import from here; this module never imports
// from them, so there is no circular dependency. The one place a tab needs to
// hook back into app-level behavior (reloading the party view after a
// recalculation) goes through the onRecalculated() registration below instead
// of a direct import.

import { call } from '../localApi.js';
import { saveDraft, clearDraft } from '../draftStore.js';
import { $, el } from './dom.js';

/**
 * Same call shape the old server-backed build used, so every tab is
 * unchanged — it just runs in the page now instead of over HTTP.
 */
export async function api(path, opts) {
  const body = opts?.body ? JSON.parse(opts.body) : {};
  return call(path.split('?')[0], body);
}

let toastTimer;
export function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), bad ? 6000 : 2500);
}

// --- dirty flag, undo buttons, draft persistence (IndexedDB) -----------------
// Keeps a rolling copy of the in-progress edit in IndexedDB, keyed to the file
// that was opened, so an accidental tab close or crash doesn't lose a whole
// session's edits - only the Revert/Discard paths ever throw a draft away.

export let dirty = false;

let currentFileName = null;
let currentFileHash = null;
let draftTimer = null;

/** Called once a file is opened, so draft persistence knows what to key itself to. */
export function setCurrentFile(name, hash) {
  currentFileName = name;
  currentFileHash = hash;
}

export function getCurrentFileName() { return currentFileName; }

function scheduleDraftPersist() {
  if (!currentFileName) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    try {
      const { bytes } = await api('/api/serialize');
      await saveDraft(currentFileName, currentFileHash, bytes);
    } catch { /* a failed background save should never interrupt editing */ }
  }, 1500);
}

export async function discardDraft() {
  clearTimeout(draftTimer);
  if (currentFileName) await clearDraft(currentFileName);
}

export function setDirty(v) {
  dirty = v;
  $('#dirty').classList.toggle('hidden', !v);
  $('#write').disabled = !v;
  if (v) scheduleDraftPersist();
}

/** Enable/disable the Undo/Redo buttons to match the current history. */
export async function refreshUndoButtons() {
  try {
    const { canUndo, canRedo } = await api('/api/undoState');
    $('#undo').disabled = !canUndo;
    $('#redo').disabled = !canRedo;
  } catch { /* no file open yet */ }
}

// Runs after an edit changes a Pokemon in a way its card header summarizes
// (a recalculated stat, or a forced nature/gender/ability/shininess flag), if
// the caller has registered one - app.js wires this to "reload the party tab
// if it's the one currently showing" without src/ui/session.js needing to
// import the party tab. `statsChanged` tells the hook whether to toast about
// it: a recalculation is worth announcing, a plain flag flip isn't.
let recalcHook = null;
export function onRecalculated(fn) { recalcHook = fn; }

/** Write one value back, keeping the row's visual state in sync. */
export async function setValue(path, value, node, label) {
  try {
    const r = await api('/api/set', { method: 'POST', body: JSON.stringify({ path, value, label }) });
    setDirty(true);
    refreshUndoButtons();
    node?.classList.add('changed');
    if (r.recalculated && recalcHook) await recalcHook(true);
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  }
}

/**
 * Write one of a Pokemon's override flags (@shinyflag/@genderflag/@abilityflag/
 * @natureflag), which may not exist as an ivar yet - see the OVERRIDE_FLAGS
 * comment in views.js. `monPath` addresses the Pokemon itself, not the ivar.
 * Always redraws the card so the header's derived-facts line stays in sync,
 * since that line lives on the read side and won't update on its own.
 */
export async function setFlagValue(monPath, ivarName, value, node, label) {
  try {
    const r = await api('/api/pokemon/setFlag', {
      method: 'POST',
      body: JSON.stringify({ path: monPath, ivar: ivarName, value, label }),
    });
    setDirty(true);
    refreshUndoButtons();
    node?.classList.add('changed');
    if (recalcHook) await recalcHook(r.recalculated);
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  }
}

// --- shared option caches ------------------------------------------------------

// Cache of { id, label } option lists fetched from /api/options, and the
// <datalist> elements built from them, so searchable combo boxes (species,
// items, maps, trainer types, ...) only load their list once.
const kindOptionsCache = {};
export async function ensureKindOptions(kind) {
  if (kindOptionsCache[kind]) return kindOptionsCache[kind];
  const { options } = await api('/api/options', { body: JSON.stringify({ kind }) });
  kindOptionsCache[kind] = options;
  let dl = document.getElementById(`dl-${kind}`);
  if (!dl) {
    dl = el('datalist');
    dl.id = `dl-${kind}`;
    document.body.append(dl);
  }
  dl.innerHTML = '';
  for (const o of options) dl.append(new Option(o.label));
  return options;
}

// Items are also looked up by the "add Pokemon" held-item field, so the list
// (and its <datalist>) is shared between the bag and party tabs here.
export let itemOpts = [];
export async function ensureItemOptions() {
  if (itemOpts.length) return itemOpts;
  itemOpts = (await api('/api/options', { body: JSON.stringify({ kind: 'items' }) })).options;
  const il = $('#itemList');
  for (const o of itemOpts) il.append(new Option(o.label));
  return itemOpts;
}

/** Parse "25 - Pikachu" or "Pikachu" or "25" into an id. */
export function pickId(text, opts) {
  const s = (text || '').trim();
  if (!s) return 0;
  const direct = /^(\d+)\b/.exec(s);
  if (direct) return Number(direct[1]);
  const hit = opts.find((o) => o.label.toLowerCase() === s.toLowerCase())
    || opts.find((o) => o.label.toLowerCase().endsWith(`- ${s.toLowerCase()}`))
    || opts.find((o) => o.label.toLowerCase().includes(s.toLowerCase()));
  return hit ? hit.id : 0;
}

/**
 * Stringify an option value into a <select> key. `editValue()` reports a nil
 * ivar as '' rather than null (see src/save.js), so both collapse to the same
 * sentinel here - every field wired to `options` only ever holds a number,
 * a boolean or nil, never a real empty string, so this is unambiguous.
 */
const optKey = (v) => (v === null || v === undefined || v === '' ? ' ' : String(v));

/** An input bound to a Marshal path; commits on change. */
export function boundInput(row, f) {
  const {
    type, value, path, scalar, options, mask, kind, range, ivar, monPath,
  } = f;
  // f.label is the human name for the field (from schema.js/views.js), used
  // to describe the edit in the "what will change" summary. Named fieldLabel
  // here so it doesn't shadow the per-option `label` text below.
  const fieldLabel = f.label;

  // A bitmask packed into one integer: one checkbox per flag, all writing
  // back to the same path.
  if (mask) {
    const wrap = el('span', 'maskrow');
    let cur = typeof value === 'number' ? value : 0;
    for (const { bit, label } of mask) {
      const lab = el('label', 'masklabel');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = (cur & (1 << bit)) !== 0;
      cb.onchange = async () => {
        const next = cb.checked ? (cur | (1 << bit)) : (cur & ~(1 << bit));
        if (await setValue(path, next, row, fieldLabel)) cur = next;
        else cb.checked = !cb.checked;
      };
      lab.append(cb, document.createTextNode(label));
      wrap.append(lab);
    }
    return wrap;
  }

  if (!scalar) return el('span', 'pv', '(not directly editable)');

  // A field with a small fixed set of legal values.
  if (options) {
    const sel = el('select');
    for (const o of options) sel.append(new Option(o.label, optKey(o.value)));
    sel.value = optKey(value);
    sel.onchange = async () => {
      const chosen = options.find((o) => optKey(o.value) === sel.value);
      const raw = chosen ? chosen.value : null;
      const ok = monPath
        ? await setFlagValue(monPath, ivar, raw, row, fieldLabel)
        : await setValue(path, raw, row, fieldLabel);
      if (!ok) sel.value = optKey(value);
    };
    return sel;
  }

  // A field whose number should read as a name: searchable combo box over
  // /api/options, same UX as the "add Pokemon" species/item pickers.
  if (kind) {
    const inp = el('input');
    inp.type = 'text';
    inp.setAttribute('list', `dl-${kind}`);
    const label = (v, opts) => {
      if (v === null || v === undefined || v === 0) return v ? String(v) : '';
      const hit = opts.find((o) => o.id === v);
      return hit ? hit.label : String(v);
    };
    inp.value = label(value, kindOptionsCache[kind] || []);
    if (!kindOptionsCache[kind]) {
      ensureKindOptions(kind).then((opts) => { inp.value = label(value, opts); });
    }
    inp.onchange = async () => {
      const opts = kindOptionsCache[kind] || [];
      const id = pickId(inp.value, opts);
      if (await setValue(path, id, row, fieldLabel)) inp.value = label(id, opts);
      else inp.value = label(value, opts);
    };
    return inp;
  }

  if (type === 'bool') {
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = value === true;
    const txt = el('span', null, ` ${cb.checked}`);
    cb.onchange = async () => {
      if (await setValue(path, cb.checked, row, fieldLabel)) txt.textContent = ` ${cb.checked}`;
    };
    const wrap = el('label');
    wrap.append(cb, txt);
    return wrap;
  }
  const inp = el('input');
  inp.type = type === 'int' || type === 'float' ? 'number' : 'text';
  if (type === 'int') inp.step = '1';
  if (range) { [inp.min, inp.max] = range; }
  inp.value = value === null ? '' : value;
  inp.onchange = async () => {
    let raw = inp.value;
    if (inp.type === 'number') {
      raw = Number(raw);
    } else if (type === 'nil' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
      // A never-touched variable is nil, not 0 (see indexedList() in
      // src/views.js), so it would otherwise land on this generic text
      // branch: typing "7" here must still write a Fixnum, not the String "7".
      raw = Number(raw);
    }
    const ok = await setValue(path, raw, row, fieldLabel);
    if (!ok) inp.value = value === null ? '' : value;
  };
  if (!range) return inp;
  const wrap = el('span', 'hintwrap');
  wrap.append(inp, el('span', 'fieldhint', `(${range[0]}–${range[1]})`));
  return wrap;
}

/** The label/input/note grid every "just render these labelled fields" tab uses. */
export function fieldGrid(fields) {
  const grid = el('div', 'grid');
  for (const f of fields) {
    const row = el('div', 'field');
    row.append(el('label', null, f.label || f.ivar.replace(/^@/, '')));
    row.append(boundInput(row, f));
    if (f.resolved) row.append(el('span', 'note', f.resolved));
    if (f.note) row.append(el('span', 'note', f.note));
    grid.append(row);
  }
  return grid;
}
