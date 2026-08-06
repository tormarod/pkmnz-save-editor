import { loadData } from './src/data.js';
import { call, openBytes, restoreDraft } from './src/localApi.js';
import { labelCounts } from './src/labels.js';
import { NATURES } from './src/schema.js';
import { startExperience } from './src/expTable.js';
import { speciesSpriteUrl, itemSpriteUrl, attachSprite } from './src/sprites.js';
import { hashBytes, saveDraft, loadDraft, clearDraft } from './src/draftStore.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

let dirty = false;

// --- theme -------------------------------------------------------------------

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('#themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
}

(function initTheme() {
  const stored = localStorage.getItem('pkmnz-theme');
  const theme = stored || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(theme);
})();

$('#themeToggle').onclick = () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('pkmnz-theme', next);
  applyTheme(next);
};

// Ruby/Marshal type glossary for the Raw tree tab, where every value is
// labeled with its bare Marshal type name.
const TYPE_GLOSSARY = {
  nil: 'Ruby nil — "no value". Booleans and nil-by-default fields both read as this until something sets them.',
  bool: 'A true/false value.',
  int: 'A Fixnum — a plain integer.',
  str: 'A Ruby String (text).',
  float: 'A floating-point number.',
  sym: 'A Ruby Symbol — an internal, code-facing name (like :some_name), not user-facing text.',
  bignum: 'A Bignum — an integer too large for a Fixnum. Trainer IDs and similar values often show up here.',
  array: 'A Ruby Array — an ordered list. Expand it to see its entries.',
  hash: 'A Ruby Hash — a key/value map. Expand it to see its entries.',
  obj: 'A Ruby object with named instance variables (ivars). Expand it to see its fields.',
  userdef: 'Custom binary data the game serializes itself. Shown as raw bytes; not editable here.',
  usrmarshal: 'An object with its own custom Marshal encoding.',
  struct: 'A Ruby Struct — fixed, named fields, like a lightweight object.',
  class: 'A reference to a Ruby class itself (rare in save data).',
  module: 'A reference to a Ruby module (rare in save data).',
  regexp: 'A compiled regular expression (rare in save data).',
};

const SPECIAL_TAG = { reserved: 'reserved', computed: 'script condition' };
const SPECIAL_HINT = {
  reserved: 'Blocked out by the developers for future use. Nothing currently reads it, so editing it is harmless but has no visible effect.',
  computed: "Pokémon Essentials' built-in placeholder name for a scripted condition (time of day, day of week, ...). "
    + "The game evaluates that expression directly and does not read this switch's stored value, "
    + 'so toggling it here will not change anything in-game.',
};

/**
 * Same call shape the old server-backed build used, so every tab below is
 * unchanged — it just runs in the page now instead of over HTTP.
 */
async function api(path, opts) {
  const body = opts?.body ? JSON.parse(opts.body) : {};
  return call(path.split('?')[0], body);
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), bad ? 6000 : 2500);
}

// --- draft persistence (IndexedDB) --------------------------------------------
// Keeps a rolling copy of the in-progress edit in IndexedDB, keyed to the file
// that was opened, so an accidental tab close or crash doesn't lose a whole
// session's edits - only the Revert/Discard paths ever throw a draft away.

let currentFileName = null;
let currentFileHash = null;
let draftTimer = null;

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

async function discardDraft() {
  clearTimeout(draftTimer);
  if (currentFileName) await clearDraft(currentFileName);
}

function setDirty(v) {
  dirty = v;
  $('#dirty').classList.toggle('hidden', !v);
  $('#write').disabled = !v;
  if (v) scheduleDraftPersist();
}

/** Enable/disable the Undo/Redo buttons to match the current history. */
async function refreshUndoButtons() {
  try {
    const { canUndo, canRedo } = await api('/api/undoState');
    $('#undo').disabled = !canUndo;
    $('#redo').disabled = !canRedo;
  } catch { /* no file open yet */ }
}

/** Write one value back, keeping the row's visual state in sync. */
async function setValue(path, value, node, label) {
  try {
    const r = await api('/api/set', { method: 'POST', body: JSON.stringify({ path, value, label }) });
    setDirty(true);
    refreshUndoButtons();
    node?.classList.add('changed');
    // Editing IVs/EVs/level/species recomputes the Pokemon's cached stats, so
    // redraw the tab to show the new numbers.
    if (r.recalculated && current === 'party') {
      await loadParty();
      toast('Stats recalculated');
    }
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  }
}

// Cache of { id, label } option lists fetched from /api/options, and the
// <datalist> elements built from them, so searchable combo boxes (species,
// items, maps, trainer types, ...) only load their list once.
const kindOptionsCache = {};
async function ensureKindOptions(kind) {
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

/**
 * Stringify an option value into a <select> key. `editValue()` reports a nil
 * ivar as '' rather than null (see src/save.js), so both collapse to the same
 * sentinel here - every field wired to `options` only ever holds a number,
 * a boolean or nil, never a real empty string, so this is unambiguous.
 */
const optKey = (v) => (v === null || v === undefined || v === '' ? ' ' : String(v));

/** An input bound to a Marshal path; commits on change. */
function boundInput(row, f) {
  const {
    type, value, path, scalar, options, mask, kind, range,
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
      if (!(await setValue(path, raw, row, fieldLabel))) sel.value = optKey(value);
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
      // A never-touched variable is nil, not 0 (see indexedList() in views.js),
      // so it would otherwise land on this generic text branch: typing "7" here
      // must still write a Fixnum, not the String "7".
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

// --- summary -----------------------------------------------------------------

function renderSummary(s) {
  const box = $('#summary');
  box.innerHTML = '';
  if (!s) return;
  const item = (label, val, flag) => {
    const d = el('div');
    d.append(el('dt', null, label), el('dd', flag ? 'flag' : null, val ?? '—'));
    return d;
  };
  box.append(
    item('File', s.file),
    item('Slot (var 99)', s.slot),
    item('Writes back to', s.expectedFile, s.slotMismatch),
    item('Trainer', s.trainerName),
    item('Money', s.money?.toLocaleString()),
    item('Badges', `${s.badges}/8`),
    item('Party', s.partyCount),
    item('Play time', s.playTime),
    item('Location', s.mapName || `map ${s.mapId}`),
    item('Times saved', s.saveCount),
  );

  const banner = $('#banner');
  if (s.slotMismatch) {
    banner.textContent =
      `Slot mismatch: this file is named ${s.file}, but variable 99 is ${s.slot}, ` +
      `so the game will write it back to ${s.expectedFile}. ` +
      `Set variable 99 to ${s.file === 'Game.rxdata' ? '0' : s.file.match(/\d+/)?.[0]} to match the filename.`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// --- indexed lists (variables / switches) ------------------------------------

function makeIndexedTab(kind, listSel, filterSel, onlySel) {
  let rows = [];
  const listEl = $(listSel);

  const draw = () => {
    const q = $(filterSel).value.trim().toLowerCase();
    listEl.innerHTML = '';
    const shown = rows.filter((r) =>
      !q || String(r.index) === q || String(r.index).includes(q) || (r.name || '').toLowerCase().includes(q));
    if (!shown.length) { listEl.append(el('div', 'row', 'nothing matches')); return; }
    const frag = document.createDocumentFragment();
    for (const r of shown.slice(0, 1200)) {
      const row = el('div', 'row');
      row.append(el('span', 'idx', String(r.index)));
      const nmWrap = el('span', 'nmwrap');
      const nm = el('span', `nm${r.name ? '' : ' unnamed'}`, r.name || '(unnamed)');
      nmWrap.append(nm);
      if (r.special) {
        nm.title = SPECIAL_HINT[r.special];
        const tag = el('span', `tag tag-${r.special}`, SPECIAL_TAG[r.special]);
        tag.title = SPECIAL_HINT[r.special];
        nmWrap.append(tag);
      }
      row.append(nmWrap);
      row.append(boundInput(row, r));
      frag.append(row);
    }
    listEl.append(frag);
    if (shown.length > 1200) listEl.append(el('div', 'trunc', `…${shown.length - 1200} more, narrow the filter`));
  };

  const load = async () => {
    rows = (await api(`/api/${kind}`, { body: JSON.stringify({ onlySet: $(onlySel).checked }) })).rows;
    draw();
  };

  $(filterSel).oninput = draw;
  $(onlySel).onchange = load;
  return load;
}

// --- trainer -----------------------------------------------------------------

async function loadTrainer() {
  const t = await api('/api/trainer');
  const body = $('#trainerBody');
  body.innerHTML = '';

  const card = el('div', 'card');
  card.append(el('h3', null, 'Trainer'));
  const grid = el('div', 'grid');
  for (const f of t.fields) {
    const row = el('div', 'field');
    row.append(el('label', null, f.label || f.ivar.replace(/^@/, '')));
    row.append(boundInput(row, f));
    if (f.resolved) row.append(el('span', 'note', f.resolved));
    if (f.note) row.append(el('span', 'note', f.note));
    grid.append(row);
  }
  card.append(grid);
  body.append(card);

  const bcard = el('div', 'card');
  bcard.append(el('h3', null, 'Badges'));
  const badges = el('div', 'badges');
  for (const b of t.badges) {
    const lab = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = b.value;
    cb.onchange = () => setValue(b.path, cb.checked, lab, `Badge ${b.index + 1}`);
    lab.append(cb, el('span', null, ` ${b.index + 1}`));
    badges.append(lab);
  }
  bcard.append(badges);
  body.append(bcard);

  const dcard = el('div', 'card');
  dcard.append(el('h3', null, 'Pokédex'));
  for (const d of t.dex) {
    dcard.append(el('div', null, `${d.ivar.replace(/^@/, '')}: ${d.count} of ${d.total}`));
  }
  body.append(dcard);
}

// --- bag ---------------------------------------------------------------------

// Index 0 is unused - PBS/items.txt numbers its Pocket field 1..8, and the
// save uses that same number as the @pockets array index (see src/bag.js).
const POCKETS = [null, 'Items', 'Medicine', 'Poké Balls', 'TMs & HMs', 'Berries',
  'Mail', 'Battle items', 'Key items'];

async function loadBag() {
  const { pockets } = await api('/api/bag');
  const body = $('#bagBody');
  body.innerHTML = '';
  for (const p of pockets) {
    if (p.pocket === 0) continue; // unused, mirrors variable/switch index 0
    const pocketName = POCKETS[p.pocket] || `Pocket ${p.pocket}`;
    const card = el('div', 'card');
    const h = el('h3', 'flexhead', pocketName);
    h.append(el('small', null, `${p.items.length} item${p.items.length === 1 ? '' : 's'}`));
    if (p.items.length) {
      h.append(el('span', 'spacer'));
      const maxBtn = el('button', 'tiny', 'Max stack');
      maxBtn.title = 'Set every item already in this pocket to the maximum stack size (999)';
      maxBtn.onclick = async () => {
        try {
          const r = await api('/api/bag/maxPocket', { method: 'POST', body: JSON.stringify({ pocket: p.pocket }) });
          setDirty(true);
          refreshUndoButtons();
          toast(r.count ? `Maxed ${r.count} item${r.count === 1 ? '' : 's'}` : 'Already at max');
          await loadBag();
        } catch (e) { toast(e.message, true); }
      };
      h.append(maxBtn);
    }
    card.append(h);
    if (!p.items.length) {
      card.append(el('div', 'empty', 'empty'));
    } else {
      const table = el('table', 'items');
      const head = el('tr');
      for (const c of ['', 'ID', 'Item', 'Quantity']) head.append(el('th', null, c));
      table.append(head);
      for (const it of p.items) {
        const tr = el('tr');
        const iconc = el('td', 'iconcell');
        attachSprite(iconc, itemSpriteUrl(it.internal), it.name, 'sprite item-sprite');
        const idc = el('td');
        idc.append(boundInput(tr, {
          type: 'int', value: it.id, path: it.idPath, scalar: true, label: `${pocketName}: item id`,
        }));
        const qc = el('td');
        qc.append(boundInput(tr, {
          type: 'int', value: it.qty, path: it.qtyPath, scalar: true, label: `${it.name || 'item'} quantity`,
        }));
        tr.append(iconc, idc, el('td', null, it.name || '(unknown)'), qc);
        table.append(tr);
      }
      card.append(table);
    }
    body.append(card);
  }
}

/** Wires the "Add an item" form once; the item goes into its PBS-declared pocket. */
async function initBagAddForm() {
  if (initBagAddForm.done) return;
  initBagAddForm.done = true;
  await ensureItemOptions();

  const preview = () => {
    const id = pickId($('#addItemText2').value, itemOpts);
    const hit = itemOpts.find((o) => o.id === id);
    const qty = Number($('#addItemQty').value) || 1;
    $('#addItemPreview').textContent = hit
      ? `Will add ${qty}x ${hit.label}.`
      : ($('#addItemText2').value.trim() ? 'No item matches that.' : '');
  };
  $('#addItemText2').oninput = preview;
  $('#addItemQty').oninput = preview;

  $('#addItemGo').onclick = async () => {
    const item = pickId($('#addItemText2').value, itemOpts);
    if (!item) { toast('Pick an item first', true); return; }
    const qty = Number($('#addItemQty').value) || 1;
    try {
      const r = await api('/api/item/add', { method: 'POST', body: JSON.stringify({ item, qty }) });
      setDirty(true);
      refreshUndoButtons();
      toast(r.stacked ? `Now have ${r.qty} in the ${POCKETS[r.pocket] || `pocket ${r.pocket}`} pocket` : `Added to the ${POCKETS[r.pocket] || `pocket ${r.pocket}`} pocket`);
      await loadBag();
    } catch (e) { toast(e.message, true); }
  };
}

// --- party & boxes -----------------------------------------------------------

function monCard(mon, title, loc) {
  const monName = mon.nickname || mon.speciesName || `species ${mon.species}`;
  const card = el('div', 'card');
  const h = el('h3', 'monhead');
  attachSprite(h, speciesSpriteUrl(mon.species), mon.speciesName, 'sprite');
  h.append(document.createTextNode(`${title}  ${mon.speciesName || `species ${mon.species}`}`));
  const bits = [];
  if (mon.nickname && mon.nickname !== mon.speciesName) bits.push(`"${mon.nickname}"`);
  if (mon.egg) bits.push('egg');
  if (mon.itemName) bits.push(`holding ${mon.itemName}`);
  bits.push(`HP ${mon.hp}/${mon.totalhp}`);
  h.append(el('small', null, bits.join(' · ')));

  if (loc) {
    h.append(el('span', 'spacer'));
    const move = el('button', 'tiny', loc.where === 'party' ? 'To box' : 'To party');
    move.onclick = async () => {
      try {
        await api('/api/pokemon/move', {
          method: 'POST',
          body: JSON.stringify(loc.where === 'party'
            ? { direction: 'toBox', index: loc.index, box: 0 }
            : { direction: 'toParty', box: loc.box, slot: loc.slot }),
        });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    const del = el('button', 'tiny danger', 'Remove');
    del.onclick = async () => {
      if (!confirm(`Remove ${monName}? This only takes effect once you write to disk.`)) return;
      try {
        await api('/api/pokemon/remove', {
          method: 'POST',
          body: JSON.stringify(loc.where === 'party'
            ? { where: 'party', index: loc.index }
            : { where: 'box', box: loc.box, slot: loc.slot }),
        });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    const maxIVs = el('button', 'tiny', 'Max IVs');
    maxIVs.title = 'Set every IV to 31 and recompute this Pokémon\'s stats';
    maxIVs.onclick = async () => {
      try {
        await api('/api/pokemon/maxIVs', { method: 'POST', body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast(`Maxed IVs for ${monName}`);
      } catch (e) { toast(e.message, true); }
    };
    const recalc = el('button', 'tiny', 'Recalculate stats');
    recalc.title = 'Recompute the cached stats from species, level, IVs, EVs and nature';
    recalc.onclick = async () => {
      try {
        await api('/api/pokemon/recalc', { body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast('Stats recalculated');
      } catch (e) { toast(e.message, true); }
    };
    h.append(move, maxIVs, recalc, del);
  }
  card.append(h);

  // The game reads these six straight out of the save, so show what is stored.
  const statLine = el('div', 'statline');
  for (const s of mon.statValues || []) {
    const chip = el('span', 'statchip');
    chip.append(el('b', null, s.name), document.createTextNode(` ${s.value}`));
    statLine.append(chip);
  }
  if (statLine.children.length) card.append(statLine);

  const grid = el('div', 'grid');

  // The save only stores exp; Level is derived from it via the growth rate
  // (see src/expTable.js), so editing it here writes the equivalent @exp
  // instead of making the user look up an exp value themselves.
  if (mon.level !== null) {
    const row = el('div', 'field');
    const lab = el('label', null, 'Level');
    lab.title = `Growth rate index ${mon.growthRate}. Stored in the save as ${mon.exp} experience.`;
    row.append(lab);
    const inp = el('input');
    inp.type = 'number';
    inp.min = 1;
    inp.max = mon.maxLevel;
    inp.value = mon.level;
    inp.onchange = async () => {
      const lvl = Math.max(1, Math.min(mon.maxLevel, Math.round(Number(inp.value)) || mon.level));
      const exp = startExperience(lvl, mon.growthRate);
      const ok = await setValue(mon.expPath, exp, row, `${monName}: Level`);
      inp.value = ok ? lvl : mon.level;
    };
    row.append(inp);
    row.append(el('span', 'note', `(${mon.exp} exp)`));
    grid.append(row);
  }

  for (const f of mon.fields) {
    const row = el('div', 'field');
    row.append(el('label', null, f.label || f.ivar.replace(/^@/, '')));
    row.append(boundInput(row, { ...f, label: `${monName}: ${f.label || f.ivar.replace(/^@/, '')}` }));
    if (f.resolved) row.append(el('span', 'note', f.resolved));
    if (f.note) row.append(el('span', 'note', f.note));
    grid.append(row);
  }
  card.append(grid);

  // "Spe" for Speed, not "Spd" — too easy to misread as SpD (Sp. Defense).
  const STAT = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'];
  const STAT_HINT = { '@iv': '0–31', '@ev': '0–252, 510 total' };
  for (const s of mon.stats) {
    const wrap = el('div', 'field');
    const statLabel = el('label', null, s.ivar.replace(/^@/, ''));
    if (STAT_HINT[s.ivar]) statLabel.title = `Valid range: ${STAT_HINT[s.ivar]}`;
    wrap.append(statLabel);
    const line = el('div', 'badges');
    s.values.forEach((v, i) => {
      const lab = el('label', null, `${STAT[i] || i} `);
      const inp = el('input');
      inp.type = 'number';
      inp.min = 0;
      inp.max = s.ivar === '@iv' ? 31 : 252;
      inp.value = v.value ?? '';
      inp.style.width = '70px';
      inp.onchange = () => setValue(v.path, Number(inp.value), lab, `${monName}: ${s.ivar.replace(/^@/, '')} ${STAT[i] || i}`);
      lab.append(inp);
      line.append(lab);
    });
    if (STAT_HINT[s.ivar]) line.append(el('span', 'fieldhint', `(${STAT_HINT[s.ivar]})`));
    wrap.append(line);
    card.append(wrap);
  }

  // Contest stats: plain 0-255 counters. The ivars may not exist yet on this
  // Pokemon (makePokemon() never sets them, and neither does most wild data),
  // so the backend creates them on first edit rather than requiring a value.
  if (mon.contest?.length) {
    const wrap = el('div', 'field');
    wrap.append(el('label', null, 'Contest'));
    const line = el('div', 'badges');
    for (const c of mon.contest) {
      const lab = el('label', null, `${c.label} `);
      const inp = el('input');
      inp.type = 'number';
      inp.min = 0;
      inp.max = 255;
      inp.value = c.value;
      inp.style.width = '60px';
      inp.onchange = async () => {
        const v = Math.max(0, Math.min(255, Math.round(Number(inp.value)) || 0));
        try {
          await api('/api/pokemon/contest', {
            method: 'POST',
            body: JSON.stringify({ path: mon.path, ivar: c.ivar, value: v }),
          });
          setDirty(true);
          refreshUndoButtons();
          inp.value = v;
        } catch (e) { toast(e.message, true); inp.value = c.value; }
      };
      lab.append(inp);
      line.append(lab);
    }
    line.append(el('span', 'fieldhint', '(0–255)'));
    wrap.append(line);
    card.append(wrap);
  }

  // Ribbons: a plain array of ribbon ids. Shown as removable chips with an
  // add-by-id control, since the Raw tree only exposes one array index at a
  // time and this fangame doesn't ship a named ribbon list to pick from.
  const ribbonWrap = el('div', 'field');
  ribbonWrap.append(el('label', null, 'Ribbons'));
  const ribbonLine = el('div', 'badges');
  const renderRibbons = (ids) => {
    ribbonLine.innerHTML = '';
    for (const id of ids) {
      const chip = el('span', 'statchip ribbonchip');
      chip.append(document.createTextNode(`${id} `));
      const rm = el('button', 'tiny danger', '×');
      rm.title = `Remove ribbon ${id}`;
      rm.onclick = async () => {
        try {
          const r = await api('/api/pokemon/ribbons/remove', {
            method: 'POST',
            body: JSON.stringify({ path: mon.path, ribbon: id }),
          });
          setDirty(true);
          refreshUndoButtons();
          renderRibbons(r.ribbons);
        } catch (e) { toast(e.message, true); }
      };
      chip.append(rm);
      ribbonLine.append(chip);
    }
    const addInp = el('input');
    addInp.type = 'number';
    addInp.min = 0;
    addInp.placeholder = 'ribbon id';
    addInp.style.width = '90px';
    const addBtn = el('button', 'tiny', 'Add');
    addBtn.onclick = async () => {
      if (addInp.value === '') return;
      try {
        const r = await api('/api/pokemon/ribbons/add', {
          method: 'POST',
          body: JSON.stringify({ path: mon.path, ribbon: Number(addInp.value) }),
        });
        setDirty(true);
        refreshUndoButtons();
        addInp.value = '';
        renderRibbons(r.ribbons);
      } catch (e) { toast(e.message, true); }
    };
    ribbonLine.append(addInp, addBtn);
  };
  renderRibbons(mon.ribbons || []);
  ribbonWrap.append(ribbonLine);
  card.append(ribbonWrap);

  if (mon.moves.length) {
    const table = el('table', 'items');
    const head = el('tr');
    for (const c of ['ID', 'Move', 'PP']) head.append(el('th', null, c));
    table.append(head);
    mon.moves.forEach((m, i) => {
      const tr = el('tr');
      const idc = el('td');
      idc.append(boundInput(tr, {
        type: 'int', value: m.id, path: m.idPath, scalar: true, label: `${monName}: move ${i + 1}`,
      }));
      const ppc = el('td');
      ppc.append(boundInput(tr, {
        type: 'int', value: m.pp, path: m.ppPath, scalar: true, label: `${monName}: ${m.name || `move ${i + 1}`} PP`,
      }));
      tr.append(idc, el('td', null, m.name || '(unknown)'), ppc);
      table.append(tr);
    });
    card.append(table);
  }
  return card;
}

async function loadParty() {
  const body = $('#partyBody');
  body.innerHTML = '';
  const { party } = await api('/api/party');
  const pc = el('div', 'card');
  const ph = el('h3', 'flexhead', `Party (${party.length})`);
  if (party.length) {
    ph.append(el('span', 'spacer'));
    const heal = el('button', 'tiny', 'Heal party');
    heal.title = 'Restore every party Pokémon to full HP, cure status, and refill move PP';
    heal.onclick = async () => {
      try {
        const r = await api('/api/party/heal', { method: 'POST', body: '{}' });
        setDirty(true);
        refreshUndoButtons();
        toast(`Healed ${r.healed} Pokémon`);
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    ph.append(heal);
  }
  pc.append(ph);
  body.append(pc);
  if (!party.length) pc.append(el('div', 'empty', 'The party is empty.'));
  party.forEach((m, i) => m && body.append(monCard(m, `Party ${i + 1}`, { where: 'party', index: i })));

  const { boxes } = await api('/api/boxes');
  allBoxes = boxes;
  const filled = boxes.filter((b) => b.count > 0);
  const bc = el('div', 'card');
  bc.append(el('h3', null, `Boxes (${filled.length} of ${boxes.length} in use)`));
  body.append(bc);
  if (!filled.length) bc.append(el('div', 'empty', 'All boxes are empty.'));
  for (const b of filled) {
    const bh = el('div', 'flexhead boxhead');
    bh.append(el('span', null, `Box ${b.index + 1}${b.name ? ` "${b.name}"` : ''}: ${b.count} of ${b.size}`));
    if (b.count > 1) {
      const sort = el('button', 'tiny', 'Sort box');
      sort.title = 'Sort this box\'s Pokémon by species, compacted to the front';
      sort.onclick = async () => {
        try {
          await api('/api/box/sort', { method: 'POST', body: JSON.stringify({ box: b.index }) });
          setDirty(true);
          refreshUndoButtons();
          await loadParty();
          toast(`Sorted box ${b.index + 1}`);
        } catch (e) { toast(e.message, true); }
      };
      bh.append(sort);
    }
    body.append(bh);
    b.pokemon.forEach((m) => body.append(
      monCard(m, `Box ${b.index + 1} slot ${m.slot + 1}`, { where: 'box', box: b.index, slot: m.slot }),
    ));
  }
  fillBoxPicker();
}

// --- the add form ------------------------------------------------------------

let allBoxes = [];
let speciesOpts = [];
let itemOpts = [];

/** Loads the item list once and fills the shared #itemList datalist. */
async function ensureItemOptions() {
  if (itemOpts.length) return itemOpts;
  itemOpts = (await api('/api/options', { body: JSON.stringify({ kind: 'items' }) })).options;
  const il = $('#itemList');
  for (const o of itemOpts) il.append(new Option(o.label));
  return itemOpts;
}

function fillBoxPicker() {
  const sel = $('#addBoxNum');
  if (sel.options.length === allBoxes.length && allBoxes.length) return;
  sel.innerHTML = '';
  for (const b of allBoxes) {
    sel.append(new Option(`Box ${b.index + 1}${b.name ? ` "${b.name}"` : ''} — ${b.count}/${b.size}`, b.index));
  }
}

/** Parse "25 - Pikachu" or "Pikachu" or "25" into an id. */
function pickId(text, opts) {
  const s = (text || '').trim();
  if (!s) return 0;
  const direct = /^(\d+)\b/.exec(s);
  if (direct) return Number(direct[1]);
  const hit = opts.find((o) => o.label.toLowerCase() === s.toLowerCase())
    || opts.find((o) => o.label.toLowerCase().endsWith(`- ${s.toLowerCase()}`))
    || opts.find((o) => o.label.toLowerCase().includes(s.toLowerCase()));
  return hit ? hit.id : 0;
}

function statInputs(container, def, max) {
  container.innerHTML = '';
  // PBStats order. "Spe" is Speed and "SpD" is Sp. Defense — spelled out in the
  // tooltip because those two are otherwise a keystroke apart.
  const STAT = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'];
  const FULL = ['HP', 'Attack', 'Defense', 'Speed', 'Sp. Attack', 'Sp. Defense'];
  return STAT.map((label, i) => {
    const inp = el('input');
    inp.type = 'number';
    inp.min = 0;
    inp.max = max;
    inp.title = FULL[i];
    inp.placeholder = label;
    if (def !== null) inp.value = def;
    container.append(inp);
    return inp;
  });
}

let ivInputs = [];
let evInputs = [];

async function initAddForm() {
  if (speciesOpts.length) return;
  speciesOpts = (await api('/api/options', { body: JSON.stringify({ kind: 'species' }) })).options;
  await ensureItemOptions();
  const sl = $('#speciesList');
  for (const o of speciesOpts) sl.append(new Option(o.label));

  const nat = $('#addNature');
  nat.append(new Option('From personal ID', ''));
  NATURES.forEach((n, i) => nat.append(new Option(`${i} - ${n}`, i)));

  ivInputs = statInputs($('#addIVs'), null, 31);
  evInputs = statInputs($('#addEVs'), 0, 255);

  $('#ivMax').onclick = () => ivInputs.forEach((i) => { i.value = 31; });
  $('#ivRandom').onclick = () => ivInputs.forEach((i) => { i.value = Math.floor(Math.random() * 32); });

  $('#addTarget').onchange = () => {
    $('#addBoxWrap').classList.toggle('hidden', $('#addTarget').value !== 'box');
  };

  const preview = () => {
    const id = pickId($('#addSpeciesText').value, speciesOpts);
    const hit = speciesOpts.find((o) => o.id === id);
    $('#addPreview').textContent = hit
      ? `Will create ${hit.label} at level ${$('#addLevel').value || '?'}.`
      : ($('#addSpeciesText').value.trim() ? 'No species matches that.' : '');
  };
  $('#addSpeciesText').oninput = preview;
  $('#addLevel').oninput = preview;

  $('#addGo').onclick = async () => {
    const species = pickId($('#addSpeciesText').value, speciesOpts);
    if (!species) { toast('Pick a species first', true); return; }
    const ivs = ivInputs.map((i) => i.value);
    const evs = evInputs.map((i) => i.value);
    const body = {
      species,
      level: Number($('#addLevel').value) || 1,
      nickname: $('#addNick').value.trim() || undefined,
      item: pickId($('#addItemText').value, itemOpts),
      iv: ivs.every((v) => v !== '') ? ivs.map(Number) : undefined,
      ev: evs.every((v) => v !== '') ? evs.map(Number) : undefined,
      shiny: $('#addShiny').value === '' ? undefined : $('#addShiny').value === '1',
      gender: $('#addGender').value === '' ? undefined : Number($('#addGender').value),
      nature: $('#addNature').value === '' ? undefined : Number($('#addNature').value),
      ability: $('#addAbility').value === '' ? undefined : Number($('#addAbility').value),
      target: $('#addTarget').value,
      box: Number($('#addBoxNum').value) || 0,
    };
    try {
      const r = await api('/api/pokemon/add', { method: 'POST', body: JSON.stringify(body) });
      setDirty(true);
      refreshUndoButtons();
      toast(r.where === 'party'
        ? `Added to party slot ${r.index + 1}`
        : `Added to box ${r.box + 1}, slot ${r.slot + 1}`);
      await loadParty();
    } catch (e) { toast(e.message, true); }
  };
}

// --- raw tree ----------------------------------------------------------------

async function treeChildren(path) {
  return (await api('/api/tree', { body: JSON.stringify({ path }) })).children;
}

function treeNode(child, path) {
  const node = el('div', 'node');
  const self = el('div', 'self');
  const tw = el('span', `twist${child.expandable ? '' : ' leaf'}`, child.expandable ? '▸' : '·');
  self.append(tw);
  self.append(el('span', 'key', child.label));
  const ty = el('span', 'ty', child.type);
  if (TYPE_GLOSSARY[child.type]) ty.title = TYPE_GLOSSARY[child.type];
  self.append(ty);

  if (child.scalar) {
    self.append(boundInput(self, { ...child, path }));
  } else {
    self.append(el('span', 'pv', child.preview));
  }
  if (child.resolved) self.append(el('span', 'resolved', `= ${child.resolved}`));
  if (child.note) self.append(el('span', 'note', child.note));
  node.append(self);

  let kids = null;
  if (child.expandable) {
    tw.onclick = async () => {
      if (kids) { kids.classList.toggle('hidden'); tw.textContent = kids.classList.contains('hidden') ? '▸' : '▾'; return; }
      tw.textContent = '▾';
      kids = el('div');
      node.append(kids);
      try {
        for (const c of await treeChildren(path)) {
          if (c.truncated) { kids.append(el('div', 'trunc', `…${c.truncated} more not shown`)); continue; }
          kids.append(treeNode(c, [...path, c.step]));
        }
      } catch (e) { kids.append(el('div', 'trunc', e.message)); }
    };
  }
  return node;
}

async function loadTree() {
  const box = $('#tree');
  box.innerHTML = '';
  for (const c of await treeChildren([])) {
    box.append(treeNode(c, [c.step]));
  }
}

// --- wiring ------------------------------------------------------------------

const LOADERS = {
  variables: makeIndexedTab('variables', '#varList', '#varFilter', '#varOnlySet'),
  switches: makeIndexedTab('switches', '#swList', '#swFilter', '#swOnlySet'),
  trainer: loadTrainer,
  bag: async () => { await initBagAddForm(); await loadBag(); },
  party: async () => { await initAddForm(); await loadParty(); },
  raw: loadTree,
};

let current = 'variables';
const loaded = new Set();

async function showTab(name) {
  current = name;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === name);
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('hidden', p.dataset.panel !== name);
  if (!loaded.has(name)) {
    try { await LOADERS[name](); loaded.add(name); } catch (e) { toast(e.message, true); }
  }
}

for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => showTab(b.dataset.tab);

async function refreshAll() {
  loaded.clear();
  await showTab(current);
}

// --- "what will change" confirmation before writing ---------------------------

/** Shows the pending change list and resolves true/false for Download/Cancel. */
function confirmChanges(changes) {
  return new Promise((resolve) => {
    if (!changes.length) { resolve(true); return; }
    const overlay = el('div', 'modal-overlay');
    const box = el('div', 'modal');
    box.append(el('h3', null, `${changes.length} change${changes.length === 1 ? '' : 's'} will be written to the file`));
    const list = el('ul', 'changelist');
    for (const c of changes) {
      const li = el('li');
      li.append(el('span', 'cdesc', c.desc));
      if (c.before !== undefined) li.append(el('span', 'cdiff', `${c.before} → ${c.after}`));
      list.append(li);
    }
    box.append(list);
    const actions = el('div', 'modal-actions');
    const cancel = el('button', 'ghost', 'Cancel');
    const go = el('button', 'primary', 'Download');
    actions.append(cancel, go);
    box.append(actions);
    overlay.append(box);
    document.body.append(overlay);
    const close = (result) => { overlay.remove(); resolve(result); };
    cancel.onclick = () => close(false);
    go.onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    go.focus();
  });
}

// --- opening a file ----------------------------------------------------------

/** Offers to bring back a draft found for the file that was just opened. */
async function offerDraftRestore(draft) {
  const when = new Date(draft.updatedAt).toLocaleString();
  if (confirm(`Found unsaved edits for this file from ${when}. Restore them?`)) {
    const summary = restoreDraft(draft.bytes);
    renderSummary(summary);
    setDirty(true);
    await refreshAll();
    await refreshUndoButtons();
    toast('Restored your unsaved edits');
  } else {
    await clearDraft(currentFileName);
  }
}

async function openFile(file) {
  if (dirty && !confirm('You have unsaved edits. Discard them and open another file?')) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const summary = openBytes(file.name, bytes);
    renderSummary(summary);
    $('#openName').textContent = file.name;
    $('#dropzone').classList.add('hidden');
    $('#summary').classList.remove('hidden');
    document.querySelector('nav.tabs').classList.remove('hidden');
    document.querySelector('main').classList.remove('hidden');
    $('#reload').classList.remove('hidden');
    $('#write').classList.remove('hidden');
    $('#undo').classList.remove('hidden');
    $('#redo').classList.remove('hidden');
    setDirty(false);
    await refreshAll();
    await refreshUndoButtons();
    toast(`Opened ${file.name}`);

    currentFileName = file.name;
    currentFileHash = await hashBytes(bytes);
    const draft = await loadDraft(file.name);
    if (draft && draft.hash === currentFileHash && draft.bytes?.length) await offerDraftRestore(draft);
  } catch (e) {
    toast(`Could not read ${file.name}: ${e.message}`, true);
  }
}

$('#fileInput').onchange = (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; };
$('#pick').onclick = () => $('#fileInput').click();
$('#pick2').onclick = () => $('#fileInput').click();

// drag and drop anywhere on the page
let dragDepth = 0;
addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  $('#dropzone').classList.add('over');
});
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#dropzone').classList.remove('over');
});
addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#dropzone').classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file) openFile(file);
});

$('#reload').onclick = async () => {
  if (dirty && !confirm('Discard every edit and go back to the file you opened?')) return;
  const r = await api('/api/reload', { body: '{}' });
  renderSummary(r.open);
  setDirty(false);
  await refreshAll();
  await refreshUndoButtons();
  await discardDraft();
  toast('Reverted to the file you opened');
};

$('#write').onclick = async () => {
  try {
    const { changes } = await api('/api/changes');
    if (!(await confirmChanges(changes))) return;
    const { bytes, name } = await api('/api/serialize');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = el('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    await api('/api/markSaved');
    setDirty(false);
    await discardDraft();
    document.querySelectorAll('.changed').forEach((n) => n.classList.remove('changed'));
    toast(`Downloaded ${name} — copy it back over your save to use it`);
  } catch (e) { toast(e.message, true); }
};

$('#undo').onclick = async () => {
  try {
    const r = await api('/api/undo');
    renderSummary(r.open);
    setDirty(r.dirty);
    await refreshAll();
    await refreshUndoButtons();
    toast('Undid the last edit');
  } catch (e) { toast(e.message, true); }
};

$('#redo').onclick = async () => {
  try {
    const r = await api('/api/redo');
    renderSummary(r.open);
    setDirty(r.dirty);
    await refreshAll();
    await refreshUndoButtons();
    toast('Redid the last edit');
  } catch (e) { toast(e.message, true); }
};

// Ctrl/Cmd+Z and Ctrl/Cmd+Y (or Shift+Z) drive the undo stack, unless the user
// is mid-edit in a text field, where that shortcut should do native text undo.
addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || $('#undo').classList.contains('hidden')) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (!$('#undo').disabled) $('#undo').click();
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault();
    if (!$('#redo').disabled) $('#redo').click();
  }
});

addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

(async function init() {
  try {
    await loadData();
  } catch (e) {
    $('#dataStatus').textContent = `Could not load the game data bundle: ${e.message}`;
    $('#banner').textContent =
      'data/gamedata.json is missing, so names and Pokémon creation are unavailable. '
      + 'Run: node tools/build-data.js "<path to the Pokémon Z folder>"';
    $('#banner').classList.remove('hidden', 'bad');
    $('#banner').classList.add('bad');
    return;
  }
  const c = labelCounts();
  $('#dataStatus').textContent =
    `Labels loaded: ${c.variables} variables, ${c.switches} switches, `
    + `${c.species} species, ${c.items} items, ${c.moves} moves, ${c.maps} maps.`;
})();
