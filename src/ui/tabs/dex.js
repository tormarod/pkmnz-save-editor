// The Pokedex tab: bulk "mark all seen/owned" actions plus a filterable
// per-species seen/owned toggle list, mirroring the Variables/Switches filter UX.

import { $, el, boolToggle } from '../dom.js';
import { t } from '../../i18n.js';
import {
  api, setValue, toast, setDirty, refreshUndoButtons,
} from '../session.js';

let rows = [];

function draw() {
  const q = $('#dexFilter').value.trim().toLowerCase();
  const onlyMissing = $('#dexOnlyMissing').checked;
  const listEl = $('#dexList');
  listEl.innerHTML = '';
  const shown = rows.filter((r) => {
    if (onlyMissing && r.seen && r.owned) return false;
    if (!q) return true;
    return String(r.index) === q || String(r.index).includes(q) || (r.name || '').toLowerCase().includes(q);
  });
  if (!shown.length) { listEl.append(el('p', 'empty', t('dex.nothing'))); return; }

  const table = el('table', 'table');
  const head = el('tr');
  head.append(el('th', 'colidx', '#'), el('th', null, t('dex.species')), el('th', 'colflags', t('dex.record')));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  for (const r of shown.slice(0, 1200)) {
    const tr = el('tr');
    tr.append(el('td', 'idx', String(r.index)));
    const label = r.name || t('dex.speciesN', { n: r.index });
    tr.append(el('td', null, label));

    const flags = el('td', 'dexflags');

    const { label: seenLab, input: seenCb } = boolToggle(r.seen, t('dex.seen'));
    seenCb.onchange = async () => {
      if (await setValue(r.seenPath, seenCb.checked, tr, t('dex.seenLabel', { name: label }))) r.seen = seenCb.checked;
      else seenCb.checked = r.seen;
    };

    const { label: ownedLab, input: ownedCb } = boolToggle(r.owned, t('dex.owned'));
    ownedCb.onchange = async () => {
      if (await setValue(r.ownedPath, ownedCb.checked, tr, t('dex.ownedLabel', { name: label }))) r.owned = ownedCb.checked;
      else ownedCb.checked = r.owned;
    };

    flags.append(seenLab, ownedLab);
    tr.append(flags);
    body.append(tr);
  }
  table.append(body);
  listEl.append(table);
  if (shown.length > 1200) listEl.append(el('p', 'trunc', t('dex.more', { n: shown.length - 1200 })));
}

export async function loadDex() {
  const r = await api('/api/dex');
  rows = r.rows;
  const seenCount = rows.filter((x) => x.seen).length;
  const ownedCount = rows.filter((x) => x.owned).length;
  $('#dexCount').textContent = t('dex.count', { owned: ownedCount, seen: seenCount, total: rows.length });
  draw();
}

async function markAll(which) {
  try {
    const r = await api('/api/dex/markAll', { method: 'POST', body: JSON.stringify({ which }) });
    setDirty(true);
    refreshUndoButtons();
    const done = which === 'seen' ? 'dex.markedSeen' : 'dex.markedOwned';
    const already = which === 'seen' ? 'dex.allSeen' : 'dex.allOwned';
    toast(r.count ? t(done, { n: r.count }) : t(already));
    await loadDex();
  } catch (e) { toast(e.message, true); }
}

export function initDexTab() {
  if (initDexTab.done) return;
  initDexTab.done = true;
  $('#dexFilter').oninput = draw;
  $('#dexOnlyMissing').onchange = draw;
  $('#dexMarkSeen').onclick = () => markAll('seen');
  $('#dexMarkOwned').onclick = () => markAll('owned');
}
