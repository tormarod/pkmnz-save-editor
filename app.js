import { loadData } from './src/data.js';
import { openBytes, restoreDraft } from './src/localApi.js';
import { labelCounts } from './src/labels.js';
import { hashBytes, loadDraft, clearDraft } from './src/draftStore.js';
import { $, el } from './src/ui/dom.js';
import { initTheme } from './src/ui/theme.js';
import { openModal, confirmModal, trapFocus } from './src/ui/modal.js';
import {
  api, dirty, setDirty, refreshUndoButtons, onRecalculated, onChangesChanged, toast,
  setCurrentFile, getCurrentFileName, discardDraft, ensureItemOptions, ensureKindOptions,
} from './src/ui/session.js';
import { makeIndexedTab } from './src/ui/tabs/indexed.js';
import { loadTrainer } from './src/ui/tabs/trainer.js';
import { loadWorld } from './src/ui/tabs/world.js';
import { loadOptions } from './src/ui/tabs/options.js';
import { loadDex, initDexTab } from './src/ui/tabs/dex.js';
import { loadBag, initBagAddForm } from './src/ui/tabs/bag.js';
import { loadParty, initAddForm } from './src/ui/tabs/party.js';
import { loadTree } from './src/ui/tabs/rawTree.js';

initTheme();

// --- summary -------------------------------------------------------------------

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

// --- persistent change panel -----------------------------------------------
// Always-available view of state.changes (not just at download time), with a
// per-entry Revert: a field edit reverts exactly on its own; a structural
// entry (add/remove/move/bulk action) rewinds to the snapshot from just before
// it, which also drops any later changes - confirmed with the user first.

async function revertChange(entry, changes) {
  const idx = changes.indexOf(entry);
  const laterCount = changes.length - idx - 1;
  if (laterCount > 0 && !(await confirmModal(
    `Reverting "${entry.desc}" will also undo ${laterCount} more recent change${laterCount === 1 ? '' : 's'}. Continue?`,
    { confirmLabel: 'Revert', danger: true },
  ))) return;
  try {
    const r = await api('/api/changes/revert', {
      method: 'POST',
      body: JSON.stringify({ key: entry.key, confirmed: laterCount > 0 }),
    });
    setDirty(r.dirty);
    await refreshAll();
    await refreshUndoButtons();
    toast('Reverted');
  } catch (e) { toast(e.message, true); }
}

function renderChangesPanel(changes) {
  const panel = $('#changesPanel');
  const list = $('#changesList');
  list.innerHTML = '';
  $('#changesCount').textContent = `(${changes.length})`;
  if (!changes.length) {
    list.append(el('li', null, 'No changes yet.'));
    return;
  }
  for (const c of changes) {
    const li = el('li');
    li.append(el('span', 'cdesc', c.desc));
    if (c.before !== undefined) li.append(el('span', 'cdiff', `${c.before} → ${c.after}`));
    const revert = el('button', 'tiny danger', 'Revert');
    revert.onclick = () => revertChange(c, changes);
    li.append(revert);
    list.append(li);
  }
}
onChangesChanged(renderChangesPanel);

// --- wiring ----------------------------------------------------------------

const LOADERS = {
  variables: makeIndexedTab('variables', '#varList', '#varFilter', '#varOnlySet'),
  switches: makeIndexedTab('switches', '#swList', '#swFilter', '#swOnlySet'),
  trainer: loadTrainer,
  world: loadWorld,
  options: loadOptions,
  dex: async () => { initDexTab(); await loadDex(); },
  bag: async () => { await initBagAddForm(); await loadBag(); },
  party: async () => { await initAddForm(); await loadParty(); },
  raw: loadTree,
};

// Same order as the tab buttons in index.html, for the 1-9 shortcut.
const TAB_ORDER = ['variables', 'switches', 'trainer', 'world', 'options', 'dex', 'bag', 'party', 'raw'];
const FILTER_SEL = {
  variables: '#varFilter', switches: '#swFilter', dex: '#dexFilter', party: '#partyFilter',
};

let current = 'variables';
const loaded = new Set();

// Editing IVs/EVs/level/species recomputes the Pokemon's cached stats, and
// forcing a nature/gender/ability/shininess override changes what the card
// header summarizes; if the party tab is the one showing, redraw it so the
// change is visible. Only the former is worth a toast.
onRecalculated(async (statsChanged) => {
  if (current === 'party') {
    await loadParty();
    if (statsChanged) toast('Stats recalculated');
  }
});

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

// --- global search -------------------------------------------------------------
// One box that searches variables, switches, items, species, moves and every
// labelled trainer/world/options field at once, and jumps to the hit's tab -
// with 1000 variables, 1000 switches and nine tabs, this is the biggest
// navigation win available. Built lazily (once per file open) since it needs
// every options/label table loaded, not just the tabs the user has visited.

function highlightRow(row) {
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.remove('search-hit');
  // eslint-disable-next-line no-void
  void row.offsetWidth; // restart the CSS animation if the same row was just hit
  row.classList.add('search-hit');
}

/** A field-search hit: switch to `tab`, then scroll to and flash the .field row whose <label> matches. */
function jumpToField(tab, containerSel, label) {
  return async () => {
    await showTab(tab);
    const row = [...document.querySelectorAll(`${containerSel} .field`)]
      .find((r) => r.querySelector('label')?.textContent.trim() === label);
    highlightRow(row);
  };
}

const stripId = (label) => label.replace(/^\d+\s*-\s*/, '');

async function buildSearchIndex() {
  const entries = [];

  const [{ rows: varRows }, { rows: swRows }] = await Promise.all([api('/api/variables'), api('/api/switches')]);
  for (const v of varRows) {
    if (!v.name) continue;
    entries.push({
      cat: 'Variable', label: `${v.index} — ${v.name}`,
      action: async () => {
        await showTab('variables');
        $('#varFilter').value = String(v.index);
        $('#varFilter').dispatchEvent(new Event('input'));
        highlightRow([...document.querySelectorAll('#varList .row')].find((r) => r.querySelector('.idx')?.textContent === String(v.index)));
      },
    });
  }
  for (const s of swRows) {
    if (!s.name) continue;
    entries.push({
      cat: 'Switch', label: `${s.index} — ${s.name}`,
      action: async () => {
        await showTab('switches');
        $('#swFilter').value = String(s.index);
        $('#swFilter').dispatchEvent(new Event('input'));
        highlightRow([...document.querySelectorAll('#swList .row')].find((r) => r.querySelector('.idx')?.textContent === String(s.index)));
      },
    });
  }

  const items = await ensureItemOptions();
  for (const it of items) {
    entries.push({
      cat: 'Item', label: it.label,
      action: async () => {
        await showTab('bag');
        const row = [...document.querySelectorAll('#bagBody tr')].find((r) => r.dataset.itemId === String(it.id));
        if (row) { highlightRow(row); return; }
        $('#addItemBox').open = true;
        $('#addItemText2').value = it.label;
        $('#addItemText2').dispatchEvent(new Event('input'));
        $('#addItemText2').focus();
      },
    });
  }

  const species = await ensureKindOptions('species');
  for (const sp of species) {
    entries.push({
      cat: 'Species', label: sp.label,
      action: async () => {
        await showTab('dex');
        $('#dexFilter').value = stripId(sp.label);
        $('#dexFilter').dispatchEvent(new Event('input'));
      },
    });
  }

  const moves = await ensureKindOptions('moves');
  for (const mv of moves) {
    entries.push({
      cat: 'Move', label: mv.label,
      action: async () => {
        await showTab('party');
        $('#partyFilter').value = stripId(mv.label);
        $('#partyFilter').dispatchEvent(new Event('input'));
      },
    });
  }

  const [trainerV, worldV, playerV, settingsV] = await Promise.all([
    api('/api/trainer'), api('/api/world'), api('/api/player'), api('/api/settings'),
  ]);
  for (const f of trainerV.fields) entries.push({ cat: 'Trainer field', label: f.label, action: jumpToField('trainer', '#trainerBody', f.label) });
  for (const f of [...worldV.fields, ...playerV.fields]) entries.push({ cat: 'World field', label: f.label, action: jumpToField('world', '#worldBody', f.label) });
  for (const f of settingsV.fields) entries.push({ cat: 'Options field', label: f.label, action: jumpToField('options', '#optionsBody', f.label) });

  return entries;
}

let searchIndex = null;
let searchActiveIdx = -1;
let searchShown = [];
let untrapSearch = null;

function closeSearch() {
  const overlay = $('#searchOverlay');
  if (overlay.classList.contains('hidden')) return;
  overlay.classList.add('hidden');
  if (untrapSearch) { untrapSearch(); untrapSearch = null; }
  $('#searchOpen').focus();
}

function renderSearchResults(query) {
  const list = $('#searchResults');
  list.innerHTML = '';
  const q = query.trim().toLowerCase();
  searchShown = !q ? [] : searchIndex
    .filter((e) => e.label.toLowerCase().includes(q))
    .slice(0, 40);
  searchActiveIdx = searchShown.length ? 0 : -1;
  if (!q) {
    list.append(el('li', 'sempty', 'Type to search variables, switches, items, species, moves and labelled fields.'));
    return;
  }
  if (!searchShown.length) {
    list.append(el('li', 'sempty', 'No matches.'));
    return;
  }
  searchShown.forEach((e, i) => {
    const li = el('li');
    if (i === searchActiveIdx) li.classList.add('active');
    li.append(el('span', 'scat', e.cat), el('span', 'slabel', e.label));
    li.onclick = () => { closeSearch(); e.action(); };
    li.onmouseenter = () => {
      searchActiveIdx = i;
      list.querySelectorAll('li').forEach((n, ni) => n.classList.toggle('active', ni === i));
    };
    list.append(li);
  });
}

async function openSearch() {
  $('#searchOverlay').classList.remove('hidden');
  untrapSearch = trapFocus($('#searchOverlay'), closeSearch);
  const input = $('#searchInput');
  input.value = '';
  $('#searchResults').innerHTML = '';
  input.focus();
  if (!searchIndex) {
    $('#searchResults').append(el('li', 'sempty', 'Loading…'));
    try { searchIndex = await buildSearchIndex(); } catch (e) { toast(e.message, true); closeSearch(); return; }
  }
  renderSearchResults(input.value);
}

$('#searchOpen').onclick = openSearch;
$('#searchInput').oninput = (e) => renderSearchResults(e.target.value);
$('#searchOverlay').onclick = (e) => { if (e.target === $('#searchOverlay')) closeSearch(); };
$('#searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!searchShown.length) return;
    searchActiveIdx = (searchActiveIdx + (e.key === 'ArrowDown' ? 1 : -1) + searchShown.length) % searchShown.length;
    $('#searchResults').querySelectorAll('li').forEach((n, i) => n.classList.toggle('active', i === searchActiveIdx));
    $('#searchResults').children[searchActiveIdx]?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const hit = searchShown[searchActiveIdx];
    if (hit) { closeSearch(); hit.action(); }
  }
});

// --- "what will change" confirmation before writing ---------------------------

/** Shows the pending change list (plus any validator warnings) and resolves true/false for Download/Cancel. */
function confirmChanges(changes, warnings) {
  return new Promise((resolve) => {
    if (!changes.length && !warnings.length) { resolve(true); return; }
    const { box, close } = openModal({ onClose: (r) => resolve(r === true) });
    box.append(el('h3', null, `${changes.length} change${changes.length === 1 ? '' : 's'} will be written to the file`));
    if (warnings.length) {
      const warnBox = el('ul', 'warnlist');
      for (const w of warnings) warnBox.append(el('li', null, w));
      box.append(warnBox);
    }
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
    cancel.onclick = () => close(false);
    go.onclick = () => close(true);
    go.focus();
  });
}

// --- opening a file ----------------------------------------------------------

/** Offers to bring back a draft found for the file that was just opened. */
async function offerDraftRestore(draft) {
  const when = new Date(draft.updatedAt).toLocaleString();
  if (await confirmModal(`Found unsaved edits for this file from ${when}. Restore them?`, { confirmLabel: 'Restore' })) {
    const summary = restoreDraft(draft.bytes);
    renderSummary(summary);
    setDirty(true);
    await refreshAll();
    await refreshUndoButtons();
    toast('Restored your unsaved edits');
  } else {
    await clearDraft(getCurrentFileName());
  }
}

async function openFile(file) {
  if (dirty && !(await confirmModal('You have unsaved edits. Discard them and open another file?', { confirmLabel: 'Discard', danger: true }))) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const summary = openBytes(file.name, bytes);
    renderSummary(summary);
    $('#openName').textContent = file.name;
    $('#dropzone').classList.add('hidden');
    $('#summary').classList.remove('hidden');
    $('#changesPanel').classList.remove('hidden');
    document.querySelector('nav.tabs').classList.remove('hidden');
    document.querySelector('main').classList.remove('hidden');
    $('#reload').classList.remove('hidden');
    $('#backup').classList.remove('hidden');
    $('#write').classList.remove('hidden');
    $('#undo').classList.remove('hidden');
    $('#redo').classList.remove('hidden');
    $('#searchOpen').classList.remove('hidden');
    setDirty(false);
    await refreshAll();
    await refreshUndoButtons();
    toast(`Opened ${file.name}`);

    const hash = await hashBytes(bytes);
    setCurrentFile(file.name, hash);
    const draft = await loadDraft(file.name);
    if (draft && draft.hash === hash && draft.bytes?.length) await offerDraftRestore(draft);
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
  if (dirty && !(await confirmModal('Discard every edit and go back to the file you opened?', { confirmLabel: 'Discard', danger: true }))) return;
  const r = await api('/api/reload', { body: '{}' });
  renderSummary(r.open);
  setDirty(false);
  await refreshAll();
  await refreshUndoButtons();
  await discardDraft();
  toast('Reverted to the file you opened');
};

$('#backup').onclick = async () => {
  try {
    const { bytes, name } = await api('/api/backup');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = el('a');
    a.href = url;
    a.download = `original-${name}`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`Downloaded a backup as original-${name}, unchanged`);
  } catch (e) { toast(e.message, true); }
};

$('#write').onclick = async () => {
  try {
    const { changes } = await api('/api/changes');
    const { warnings } = await api('/api/validate');
    if (!(await confirmChanges(changes, warnings))) return;
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
    renderChangesPanel([]);
    toast(`Downloaded ${name} — if your browser saved it as "${name} (1)" or similar, rename it back to "${name}" before copying it over your save`);
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

// Ctrl/Cmd+Z, Ctrl/Cmd+Y (or Shift+Z), Ctrl/Cmd+S, "/" and 1-9 all drive the
// header/tabs, unless the user is mid-edit in a text field, where the browser's
// own behavior (native text undo, literal "/" or digit) should win instead.
addEventListener('keydown', (e) => {
  if ($('#undo').classList.contains('hidden')) return; // no file open yet
  const mod = e.ctrlKey || e.metaKey;
  const tag = document.activeElement?.tagName;
  const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearch();
    return;
  }

  if (mod && !editing) {
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (!$('#undo').disabled) $('#undo').click();
      return;
    }
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      if (!$('#redo').disabled) $('#redo').click();
      return;
    }
    if (key === 's') {
      e.preventDefault();
      if (!$('#write').disabled) $('#write').click();
      return;
    }
  }

  if (mod || editing) return;

  if (e.key === '/') {
    const sel = FILTER_SEL[current];
    if (sel) {
      e.preventDefault();
      $(sel).focus();
      $(sel).select();
    }
    return;
  }

  if (e.key >= '1' && e.key <= String(TAB_ORDER.length)) {
    const name = TAB_ORDER[Number(e.key) - 1];
    if (name) { e.preventDefault(); showTab(name); }
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
