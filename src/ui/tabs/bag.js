// The Bag tab: item pockets, the "max stack" bulk action, and the add-item form.

import { itemSpriteUrl, attachSpriteOrPlaceholder } from '../../sprites.js';
import { $, el } from '../dom.js';
import {
  api, boundInput, setDirty, refreshUndoButtons, toast, ensureItemOptions, itemOpts, pickId,
} from '../session.js';

// Index 0 is unused - PBS/items.txt numbers its Pocket field 1..8, and the
// save uses that same number as the @pockets array index (see src/bag.js).
const POCKETS = [null, 'Items', 'Medicine', 'Poké Balls', 'TMs & HMs', 'Berries',
  'Mail', 'Battle items', 'Key items'];

// Pockets worth a one-click "give a full set" bulk action: a full healing
// kit, every kind of Poké Ball, and every TM/HM this game declares.
const GIVE_SET_POCKETS = new Set([2, 3, 4]);

export async function loadBag() {
  const { pockets } = await api('/api/bag');
  const body = $('#bagBody');
  body.innerHTML = '';
  for (const p of pockets) {
    if (p.pocket === 0) continue; // unused, mirrors variable/switch index 0
    const pocketName = POCKETS[p.pocket] || `Pocket ${p.pocket}`;
    const card = el('div', 'card');
    const h = el('h3', 'flexhead', pocketName);
    h.append(el('small', null, `${p.items.length} item${p.items.length === 1 ? '' : 's'}`));
    if (p.items.length || GIVE_SET_POCKETS.has(p.pocket)) h.append(el('span', 'spacer'));
    if (p.items.length) {
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
    if (GIVE_SET_POCKETS.has(p.pocket)) {
      const giveBtn = el('button', 'tiny', 'Give a full set');
      giveBtn.title = `Add one of every ${pocketName} item this game declares`;
      giveBtn.onclick = async () => {
        try {
          const r = await api('/api/bag/giveSet', { method: 'POST', body: JSON.stringify({ pocket: p.pocket, qty: 1 }) });
          setDirty(true);
          refreshUndoButtons();
          toast(`Gave ${r.count} item${r.count === 1 ? '' : 's'}`);
          await loadBag();
        } catch (e) { toast(e.message, true); }
      };
      h.append(giveBtn);
    }
    card.append(h);
    if (!p.items.length) {
      card.append(el('div', 'empty', 'empty'));
    } else {
      const table = el('table', 'items');
      const head = el('tr');
      for (const c of ['', 'ID', 'Item', 'Quantity', '']) head.append(el('th', null, c));
      table.append(head);
      for (const it of p.items) {
        const tr = el('tr');
        tr.dataset.itemId = String(it.id);
        const iconc = el('td', 'iconcell');
        attachSpriteOrPlaceholder(iconc, itemSpriteUrl(it.internal), it.name, 'sprite item-sprite');
        const idc = el('td');
        idc.append(boundInput(tr, {
          type: 'int', value: it.id, path: it.idPath, scalar: true, label: `${pocketName}: item id`,
        }));
        const qc = el('td');
        qc.append(boundInput(tr, {
          type: 'int', value: it.qty, path: it.qtyPath, scalar: true, label: `${it.name || 'item'} quantity`,
        }));
        const rmc = el('td');
        const rmBtn = el('button', 'tiny danger', 'Remove');
        rmBtn.onclick = async () => {
          try {
            await api('/api/item/remove', { method: 'POST', body: JSON.stringify({ pocket: p.pocket, index: it.index }) });
            setDirty(true);
            refreshUndoButtons();
            toast(`Removed ${it.name || 'item'}`);
            await loadBag();
          } catch (e) { toast(e.message, true); }
        };
        rmc.append(rmBtn);
        tr.append(iconc, idc, el('td', null, it.name || '(unknown)'), qc, rmc);
        table.append(tr);
      }
      card.append(table);
    }
    body.append(card);
  }
}

/** Wires the "Add an item" form once; the item goes into its PBS-declared pocket. */
export async function initBagAddForm() {
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
