// The Pokedex tab: bulk "mark all seen/owned" actions plus a filterable
// per-species seen/owned toggle list, mirroring the Variables/Switches filter UX.

import { $, el } from '../dom.js';
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
  if (!shown.length) { listEl.append(el('div', 'row', 'nothing matches')); return; }

  const frag = document.createDocumentFragment();
  for (const r of shown.slice(0, 1200)) {
    const row = el('div', 'row');
    row.append(el('span', 'idx', String(r.index)));
    const nmWrap = el('span', 'nmwrap');
    nmWrap.append(el('span', `nm${r.name ? '' : ' unnamed'}`, r.name || `species ${r.index}`));
    row.append(nmWrap);

    const flags = el('span', 'dexflags');
    const label = r.name || `species ${r.index}`;

    const seenLab = el('label', 'check');
    const seenCb = el('input');
    seenCb.type = 'checkbox';
    seenCb.checked = r.seen;
    seenCb.onchange = async () => {
      if (await setValue(r.seenPath, seenCb.checked, row, `${label} seen`)) r.seen = seenCb.checked;
      else seenCb.checked = r.seen;
    };
    seenLab.append(seenCb, document.createTextNode(' Seen'));

    const ownedLab = el('label', 'check');
    const ownedCb = el('input');
    ownedCb.type = 'checkbox';
    ownedCb.checked = r.owned;
    ownedCb.onchange = async () => {
      if (await setValue(r.ownedPath, ownedCb.checked, row, `${label} owned`)) r.owned = ownedCb.checked;
      else ownedCb.checked = r.owned;
    };
    ownedLab.append(ownedCb, document.createTextNode(' Owned'));

    flags.append(seenLab, ownedLab);
    row.append(flags);
    frag.append(row);
  }
  listEl.append(frag);
  if (shown.length > 1200) listEl.append(el('div', 'trunc', `…${shown.length - 1200} more, narrow the filter`));
}

export async function loadDex() {
  const r = await api('/api/dex');
  rows = r.rows;
  const seenCount = rows.filter((x) => x.seen).length;
  const ownedCount = rows.filter((x) => x.owned).length;
  $('#dexCount').textContent = `${ownedCount} owned, ${seenCount} seen, of ${rows.length}`;
  draw();
}

async function markAll(which) {
  try {
    const r = await api('/api/dex/markAll', { method: 'POST', body: JSON.stringify({ which }) });
    setDirty(true);
    refreshUndoButtons();
    toast(r.count ? `Marked ${r.count} species as ${which}` : `Already all marked ${which}`);
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
