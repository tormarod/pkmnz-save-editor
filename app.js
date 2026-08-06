import { loadData } from './src/data.js';
import { openBytes, restoreDraft } from './src/localApi.js';
import { labelCounts } from './src/labels.js';
import { hashBytes, loadDraft, clearDraft } from './src/draftStore.js';
import { $, el } from './src/ui/dom.js';
import { initTheme } from './src/ui/theme.js';
import {
  api, dirty, setDirty, refreshUndoButtons, onRecalculated, toast,
  setCurrentFile, getCurrentFileName, discardDraft,
} from './src/ui/session.js';
import { makeIndexedTab } from './src/ui/tabs/indexed.js';
import { loadTrainer } from './src/ui/tabs/trainer.js';
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

// --- wiring ----------------------------------------------------------------

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

// Editing IVs/EVs/level/species recomputes the Pokemon's cached stats; if the
// party tab is the one showing, redraw it so the new numbers are visible.
onRecalculated(async () => {
  if (current === 'party') {
    await loadParty();
    toast('Stats recalculated');
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
    await clearDraft(getCurrentFileName());
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
