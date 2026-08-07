import { loadData } from './src/data.js';
import { openBytes, restoreDraft } from './src/localApi.js';
import { labelCounts } from './src/labels.js';
import { t, pick, lang, setLang } from './src/i18n.js';
import { hashBytes, loadDraft, clearDraft } from './src/draftStore.js';
import { $, el } from './src/ui/dom.js';
import { openModal, confirmModal, trapFocus } from './src/ui/modal.js';
import {
  api, dirty, setDirty, refreshUndoButtons, onRecalculated, onChangesChanged, toast,
  setCurrentFile, getCurrentFileName, discardDraft, ensureItemOptions, ensureKindOptions,
} from './src/ui/session.js';
import { loadGameState, initGameStateTab, revealEntry } from './src/ui/tabs/gameState.js';
import { loadTrainer } from './src/ui/tabs/trainer.js';
import { loadWorld } from './src/ui/tabs/world.js';
import { loadOptions } from './src/ui/tabs/options.js';
import { loadDex, initDexTab } from './src/ui/tabs/dex.js';
import { loadBag, initBagAddForm } from './src/ui/tabs/bag.js';
import { loadParty, initAddForm, fillNatureOptions } from './src/ui/tabs/party.js';
import { loadTree } from './src/ui/tabs/rawTree.js';

// --- summary -------------------------------------------------------------------
// A band of scalar stats under the header, then one line about which file the
// game will actually write this save back to. The filename itself lives in the
// header chip, so it isn't repeated as a stat here.

/** A <b>-highlighted sentence, from alternating plain/bold fragments. */
function sentence(...parts) {
  const p = el('p');
  parts.forEach((text, i) => p.append(i % 2 ? el('b', null, text) : document.createTextNode(text)));
  return p;
}

/** The slot number the filename implies: Game.rxdata is slot 0, Game_2.rxdata is 2. */
function slotForFile(file) {
  return file === 'Game.rxdata' ? 0 : Number(file.match(/_(\d+)\.rxdata$/i)?.[1] ?? NaN);
}

// Kept so switching language can redraw the summary without re-reading the save.
let lastSummary = null;

function renderSummary(s) {
  lastSummary = s;
  const box = $('#summary');
  box.innerHTML = '';
  if (!s) return;

  const stats = el('div', 'summary-stats');
  const item = (label, val) => {
    const d = el('div');
    d.append(el('dt', 'card-kicker', label), el('dd', null, val ?? '—'));
    stats.append(d);
  };
  item(t('summary.trainer'), s.trainerName);
  item(t('summary.money'), s.money?.toLocaleString());
  item(t('summary.badges'), `${s.badges}/8`);
  item(t('summary.party'), s.partyCount);
  item(t('summary.playTime'), s.playTime);
  item(t('summary.location'), s.mapName || t('summary.map', { id: s.mapId }));
  item(t('summary.timesSaved'), s.saveCount);
  box.append(stats);

  // Shown either way: "the slot matches" is as worth knowing as the warning,
  // and it's the only place the save-slot mechanic gets explained.
  const note = el('div', 'summary-note');
  const wanted = slotForFile(s.file);
  if (s.slotMismatch) {
    note.append(el('span', 'tag tag-outline', t('summary.slotMismatch')));
    note.append(sentence(
      t('summary.namedFile'), s.file, t('summary.butVar99'), String(s.slot),
      t('summary.writeBack'), s.expectedFile,
      Number.isNaN(wanted) ? '.' : t('summary.setVar99', { slot: wanted }),
    ));
  } else {
    note.append(el('span', 'tag tag-neutral', t('summary.slotMatches')));
    note.append(sentence(
      t('summary.namedFile'), s.file, t('summary.andVar99'), String(s.slot),
      t('summary.writeBack'), s.expectedFile, t('summary.noAction'),
    ));
  }
  box.append(note);
}

// --- change list -------------------------------------------------------------
// Always-available view of state.changes (not just at download time), behind a
// "Changes (n)" header button so it doesn't sit between the summary and the
// tabs. Each entry has its own Revert: a field edit reverts exactly on its own;
// a structural entry (add/remove/move/bulk action) rewinds to the snapshot from
// just before it, which also drops any later changes - confirmed with the user
// first.

async function revertChange(entry, changes) {
  const idx = changes.indexOf(entry);
  const laterCount = changes.length - idx - 1;
  if (laterCount > 0 && !(await confirmModal(
    t(laterCount === 1 ? 'changes.confirmOne' : 'changes.confirm', { desc: entry.desc, n: laterCount }),
    { confirmLabel: t('common.revert'), danger: true },
  ))) return;
  try {
    const r = await api('/api/changes/revert', {
      method: 'POST',
      body: JSON.stringify({ key: entry.key, confirmed: laterCount > 0 }),
    });
    setDirty(r.dirty);
    await refreshAll();
    await refreshUndoButtons();
    toast(t('toast.reverted'));
  } catch (e) { toast(e.message, true); }
}

let latestChanges = [];
function trackChanges(changes) {
  latestChanges = changes;
  $('#changesCount').textContent = `(${changes.length})`;
}
onChangesChanged(trackChanges);

function openChanges() {
  const changes = latestChanges;
  const { box, close } = openModal({ onClose: () => {} });
  box.append(el('h3', null, changes.length
    ? t(changes.length === 1 ? 'changes.titleOne' : 'changes.title', { n: changes.length })
    : t('changes.none')));
  if (!changes.length) {
    box.append(el('p', null, t('changes.blurb')));
  } else {
    const list = el('ul', 'changelist');
    for (const c of changes) {
      const li = el('li');
      li.append(el('span', 'cdesc', c.desc));
      if (c.before !== undefined) li.append(el('span', 'cdiff', `${c.before} → ${c.after}`));
      const revert = el('button', 'tiny danger', t('common.revert'));
      revert.onclick = async () => { close(); await revertChange(c, changes); };
      li.append(revert);
      list.append(li);
    }
    box.append(list);
  }
  const actions = el('div', 'modal-actions');
  const done = el('button', 'ghost', t('common.close'));
  done.onclick = () => close();
  actions.append(done);
  box.append(actions);
  done.focus();
}
$('#changesOpen').onclick = openChanges;

// --- wiring ----------------------------------------------------------------

const LOADERS = {
  gamestate: async () => { initGameStateTab(); await loadGameState(); },
  trainer: loadTrainer,
  world: loadWorld,
  options: loadOptions,
  dex: async () => { initDexTab(); await loadDex(); },
  bag: async () => { await initBagAddForm(); await loadBag(); },
  party: async () => { await initAddForm(); await loadParty(); },
  raw: loadTree,
};

// Same order as the tab buttons in index.html, for the 1-9 shortcut.
const TAB_ORDER = ['gamestate', 'trainer', 'world', 'options', 'dex', 'bag', 'party', 'raw'];
const FILTER_SEL = {
  gamestate: '#gsFilter', dex: '#dexFilter', party: '#partyFilter',
};

let current = 'gamestate';
const loaded = new Set();

// Editing IVs/EVs/level/species recomputes the Pokemon's cached stats, and
// forcing a nature/gender/ability/shininess override changes what the card
// header summarizes; if the party tab is the one showing, redraw it so the
// change is visible. Only the former is worth a toast.
onRecalculated(async (statsChanged) => {
  if (current === 'party') {
    await loadParty();
    if (statsChanged) toast(t('toast.recalculated'));
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

/** The curated label for a game-state row, or null when only a dev name exists. */
const pickLabel = (r) => pick({ es: r.es, en: r.en })?.n || null;

async function buildSearchIndex() {
  const entries = [];

  // Both sections now live on one tab, so one pass covers them. The dev name
  // stays searchable alongside the new label - it is what a wiki or a guide
  // will call the flag.
  const { rows: stateRows } = await api('/api/gamestate');
  for (const r of stateRows) {
    const label = pickLabel(r);
    if (!label && !r.name) continue;
    const both = label && r.name && label !== r.name ? `${label} · ${r.name}` : (label || r.name);
    entries.push({
      cat: t(r.kind === 'switch' ? 'gamestate.switch' : 'gamestate.variable'),
      label: `${r.index} — ${both}`,
      action: async () => {
        await showTab('gamestate');
        highlightRow(revealEntry(r.kind, r.index));
      },
    });
  }

  const items = await ensureItemOptions();
  for (const it of items) {
    entries.push({
      cat: t('search.item'), label: it.label,
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
      cat: t('search.species'), label: sp.label,
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
      cat: t('search.move'), label: mv.label,
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
  for (const f of trainerV.fields) entries.push({ cat: t('search.trainerField'), label: f.label, action: jumpToField('trainer', '#trainerBody', f.label) });
  for (const f of [...worldV.fields, ...playerV.fields]) entries.push({ cat: t('search.worldField'), label: f.label, action: jumpToField('world', '#worldBody', f.label) });
  for (const f of settingsV.fields) entries.push({ cat: t('search.optionsField'), label: f.label, action: jumpToField('options', '#optionsBody', f.label) });

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
    list.append(el('li', 'sempty', t('search.prompt')));
    return;
  }
  if (!searchShown.length) {
    list.append(el('li', 'sempty', t('search.none')));
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
    $('#searchResults').append(el('li', 'sempty', t('search.loading')));
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
    box.append(el('h3', null, t(changes.length === 1 ? 'changes.willWriteOne' : 'changes.willWrite', { n: changes.length })));
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
    const cancel = el('button', 'ghost', t('common.cancel'));
    const go = el('button', 'primary', t('nav.download'));
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
  const when = new Date(draft.updatedAt).toLocaleString(lang());
  if (await confirmModal(t('confirm.draft', { when }), { confirmLabel: t('common.restore') })) {
    const summary = restoreDraft(draft.bytes);
    renderSummary(summary);
    setDirty(true);
    await refreshAll();
    await refreshUndoButtons();
    toast(t('toast.draftRestored'));
  } else {
    await clearDraft(getCurrentFileName());
  }
}

async function openFile(file) {
  if (dirty && !(await confirmModal(t('confirm.openDirty'), { confirmLabel: t('common.discard'), danger: true }))) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const summary = openBytes(file.name, bytes);
    renderSummary(summary);
    $('#openName').textContent = file.name;
    // The onboarding block (wordmark, dropzone, blurb) is the whole empty
    // state — once a file is open the header/summary/tabs replace it.
    $('#onboarding').classList.add('hidden');
    $('#openName').classList.remove('hidden');
    $('#summaryWrap').classList.remove('hidden');
    document.querySelector('nav.tabs').classList.remove('hidden');
    document.querySelector('main').classList.remove('hidden');
    for (const id of ['#reload', '#backup', '#write', '#undo', '#redo', '#searchOpen', '#changesOpen']) {
      $(id).classList.remove('hidden');
    }
    setDirty(false);
    await refreshAll();
    await refreshUndoButtons();
    toast(t('toast.opened', { name: file.name }));

    const hash = await hashBytes(bytes);
    setCurrentFile(file.name, hash);
    const draft = await loadDraft(file.name);
    if (draft && draft.hash === hash && draft.bytes?.length) await offerDraftRestore(draft);
  } catch (e) {
    toast(t('toast.openFailed', { name: file.name, msg: e.message }), true);
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
  if (dirty && !(await confirmModal(t('confirm.revertAll'), { confirmLabel: t('common.discard'), danger: true }))) return;
  const r = await api('/api/reload', { body: '{}' });
  renderSummary(r.open);
  setDirty(false);
  await refreshAll();
  await refreshUndoButtons();
  await discardDraft();
  toast(t('toast.revertedAll'));
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
    toast(t('toast.backup', { name }));
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
    trackChanges([]);
    toast(t('toast.downloaded', { name }));
  } catch (e) { toast(e.message, true); }
};

$('#undo').onclick = async () => {
  try {
    const r = await api('/api/undo');
    renderSummary(r.open);
    setDirty(r.dirty);
    await refreshAll();
    await refreshUndoButtons();
    toast(t('toast.undone'));
  } catch (e) { toast(e.message, true); }
};

$('#redo').onclick = async () => {
  try {
    const r = await api('/api/redo');
    renderSummary(r.open);
    setDirty(r.dirty);
    await refreshAll();
    await refreshUndoButtons();
    toast(t('toast.redone'));
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

// --- language ------------------------------------------------------------------
// Every static string in index.html is marked with a data-i18n* attribute and
// swept from here; everything a tab builds at runtime calls t() itself and is
// redrawn when the language changes.

// What the bundle loader ended up with, kept so the line under the dropzone can
// be redrawn in the other language without reloading the bundle.
let dataLoaded = false;
let dataError = null;

function showDataStatus() {
  if (dataError) { $('#dataStatus').textContent = t('onboarding.dataFailed', { msg: dataError }); return; }
  if (!dataLoaded) return;
  $('#dataStatus').textContent = t('onboarding.dataLoaded', labelCounts());
}

/**
 * Replace the element's own text without disturbing the markup it wraps - a
 * count chip, an inline SVG, the <input> a <label> is wrapped around. Only the
 * first text node that holds anything is rewritten, and its surrounding
 * whitespace is kept so the layout does not shift.
 */
function setLabelText(node, text) {
  const own = [...node.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  if (!own) { node.textContent = text; return; }
  own.nodeValue = own.nodeValue.replace(/\S[\s\S]*\S|\S/, text);
}

/** Push the current language into every static bit of markup. */
function applyLanguage() {
  document.documentElement.lang = lang();

  for (const n of document.querySelectorAll('[data-i18n]')) setLabelText(n, t(n.dataset.i18n));
  // Two paragraphs carry <code>/<strong> runs, so their whole markup is the string.
  for (const n of document.querySelectorAll('[data-i18n-html]')) n.innerHTML = t(n.dataset.i18nHtml);
  for (const n of document.querySelectorAll('[data-i18n-placeholder]')) n.placeholder = t(n.dataset.i18nPlaceholder);
  for (const n of document.querySelectorAll('[data-i18n-title]')) n.title = t(n.dataset.i18nTitle);
  for (const n of document.querySelectorAll('[data-i18n-aria]')) n.setAttribute('aria-label', t(n.dataset.i18nAria));

  // Every boolean pill draws its On/Off text from these two, in style.css.
  document.documentElement.style.setProperty('--switch-on', `"${t('common.on')}"`);
  document.documentElement.style.setProperty('--switch-off', `"${t('common.off')}"`);

  fillNatureOptions();
  showDataStatus();
}

$('#langPick').value = lang();
$('#langPick').onchange = async (e) => {
  if (!setLang(e.target.value)) return;
  applyLanguage();
  // Descriptions, group names and the summary all change with the language, so
  // redraw whatever is on screen. The search index caches labels, so drop it.
  searchIndex = null;
  renderSummary(lastSummary);
  loaded.delete(current);
  await showTab(current);
};
applyLanguage();

addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

(async function init() {
  try {
    await loadData();
  } catch (e) {
    dataError = e.message;
    showDataStatus();
    $('#banner').textContent = t('onboarding.dataBanner');
    $('#banner').classList.remove('hidden', 'bad');
    $('#banner').classList.add('bad');
    return;
  }
  dataLoaded = true;
  showDataStatus();
})();
