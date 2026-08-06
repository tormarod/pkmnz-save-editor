import { loadData } from './src/data.js';
import { call, openBytes } from './src/localApi.js';
import { labelCounts } from './src/labels.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

let dirty = false;

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

function setDirty(v) {
  dirty = v;
  $('#dirty').classList.toggle('hidden', !v);
  $('#write').disabled = !v;
}

/** Write one value back, keeping the row's visual state in sync. */
async function setValue(path, value, node) {
  try {
    const r = await api('/api/set', { method: 'POST', body: JSON.stringify({ path, value }) });
    setDirty(true);
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

/** An input bound to a Marshal path; commits on change. */
function boundInput(row, { type, value, path, scalar }) {
  if (!scalar) return el('span', 'pv', '(not directly editable)');
  if (type === 'bool') {
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = value === true;
    const txt = el('span', null, ` ${cb.checked}`);
    cb.onchange = async () => {
      if (await setValue(path, cb.checked, row)) txt.textContent = ` ${cb.checked}`;
    };
    const wrap = el('label');
    wrap.append(cb, txt);
    return wrap;
  }
  const inp = el('input');
  inp.type = type === 'int' || type === 'float' ? 'number' : 'text';
  if (type === 'int') inp.step = '1';
  inp.value = value === null ? '' : value;
  inp.onchange = async () => {
    const ok = await setValue(path, inp.type === 'number' ? Number(inp.value) : inp.value, row);
    if (!ok) inp.value = value === null ? '' : value;
  };
  return inp;
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
      row.append(el('span', `nm${r.name ? '' : ' unnamed'}`, r.name || '(unnamed)'));
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
    row.append(el('label', null, f.ivar.replace(/^@/, '')));
    row.append(boundInput(row, f));
    if (f.resolved) row.append(el('span', 'note', f.resolved));
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
    cb.onchange = () => setValue(b.path, cb.checked, lab);
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

const POCKETS = ['Items', 'Medicine', 'Poké Balls', 'TMs & HMs', 'Berries',
  'Mail', 'Battle items', 'Key items', 'Pocket 9'];

async function loadBag() {
  const { pockets } = await api('/api/bag');
  const body = $('#bagBody');
  body.innerHTML = '';
  for (const p of pockets) {
    const card = el('div', 'card');
    const h = el('h3', null, POCKETS[p.pocket] || `Pocket ${p.pocket}`);
    h.append(el('small', null, `${p.items.length} item${p.items.length === 1 ? '' : 's'}`));
    card.append(h);
    if (!p.items.length) {
      card.append(el('div', 'empty', 'empty'));
    } else {
      const table = el('table', 'items');
      const head = el('tr');
      for (const c of ['ID', 'Item', 'Quantity']) head.append(el('th', null, c));
      table.append(head);
      for (const it of p.items) {
        const tr = el('tr');
        const idc = el('td');
        idc.append(boundInput(tr, { type: 'int', value: it.id, path: it.idPath, scalar: true }));
        const qc = el('td');
        qc.append(boundInput(tr, { type: 'int', value: it.qty, path: it.qtyPath, scalar: true }));
        tr.append(idc, el('td', null, it.name || '(unknown)'), qc);
        table.append(tr);
      }
      card.append(table);
    }
    body.append(card);
  }
}

// --- party & boxes -----------------------------------------------------------

function monCard(mon, title, loc) {
  const card = el('div', 'card');
  const h = el('h3', 'monhead', `${title}  ${mon.speciesName || `species ${mon.species}`}`);
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
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    const del = el('button', 'tiny danger', 'Remove');
    del.onclick = async () => {
      const what = mon.nickname || mon.speciesName || `species ${mon.species}`;
      if (!confirm(`Remove ${what}? This only takes effect once you write to disk.`)) return;
      try {
        await api('/api/pokemon/remove', {
          method: 'POST',
          body: JSON.stringify(loc.where === 'party'
            ? { where: 'party', index: loc.index }
            : { where: 'box', box: loc.box, slot: loc.slot }),
        });
        setDirty(true);
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    const recalc = el('button', 'tiny', 'Recalculate stats');
    recalc.title = 'Recompute the cached stats from species, level, IVs, EVs and nature';
    recalc.onclick = async () => {
      try {
        await api('/api/pokemon/recalc', { body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        await loadParty();
        toast('Stats recalculated');
      } catch (e) { toast(e.message, true); }
    };
    h.append(move, recalc, del);
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
  for (const f of mon.fields) {
    const row = el('div', 'field');
    row.append(el('label', null, f.ivar.replace(/^@/, '')));
    row.append(boundInput(row, f));
    grid.append(row);
  }
  card.append(grid);

  for (const s of mon.stats) {
    const wrap = el('div', 'field');
    wrap.append(el('label', null, s.ivar.replace(/^@/, '')));
    const line = el('div', 'badges');
    // "Spe" for Speed, not "Spd" — too easy to misread as SpD (Sp. Defense).
    const STAT = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'];
    s.values.forEach((v, i) => {
      const lab = el('label', null, `${STAT[i] || i} `);
      const inp = el('input');
      inp.type = 'number';
      inp.value = v.value ?? '';
      inp.style.width = '70px';
      inp.onchange = () => setValue(v.path, Number(inp.value), lab);
      lab.append(inp);
      line.append(lab);
    });
    wrap.append(line);
    card.append(wrap);
  }

  if (mon.moves.length) {
    const table = el('table', 'items');
    const head = el('tr');
    for (const c of ['ID', 'Move', 'PP']) head.append(el('th', null, c));
    table.append(head);
    for (const m of mon.moves) {
      const tr = el('tr');
      const idc = el('td');
      idc.append(boundInput(tr, { type: 'int', value: m.id, path: m.idPath, scalar: true }));
      const ppc = el('td');
      ppc.append(boundInput(tr, { type: 'int', value: m.pp, path: m.ppPath, scalar: true }));
      tr.append(idc, el('td', null, m.name || '(unknown)'), ppc);
      table.append(tr);
    }
    card.append(table);
  }
  return card;
}

async function loadParty() {
  const body = $('#partyBody');
  body.innerHTML = '';
  const { party } = await api('/api/party');
  const pc = el('div', 'card');
  pc.append(el('h3', null, `Party (${party.length})`));
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
    bc.append(el('div', null, `Box ${b.index + 1}${b.name ? ` "${b.name}"` : ''}: ${b.count} of ${b.size}`));
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

const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile',
  'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy',
  'Careful', 'Quirky'];

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
  itemOpts = (await api('/api/options', { body: JSON.stringify({ kind: 'items' }) })).options;
  const sl = $('#speciesList');
  for (const o of speciesOpts) sl.append(new Option(o.label));
  const il = $('#itemList');
  for (const o of itemOpts) il.append(new Option(o.label));

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
  self.append(el('span', 'ty', child.type));

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
  bag: loadBag,
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

// --- opening a file ----------------------------------------------------------

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
    setDirty(false);
    await refreshAll();
    toast(`Opened ${file.name}`);
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
  toast('Reverted to the file you opened');
};

$('#write').onclick = async () => {
  try {
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
    document.querySelectorAll('.changed').forEach((n) => n.classList.remove('changed'));
    toast(`Downloaded ${name} — copy it back over your save to use it`);
  } catch (e) { toast(e.message, true); }
};

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
