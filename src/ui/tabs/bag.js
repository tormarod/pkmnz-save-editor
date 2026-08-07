// The Bag tab: item pockets, the "max stack" bulk action, and the add-item form.

import { itemSpriteUrl, attachSpriteOrPlaceholder } from '../../sprites.js';
import { $, el } from '../dom.js';
import { t } from '../../i18n.js';
import {
  api, boundInput, setDirty, refreshUndoButtons, toast, ensureItemOptions, itemOpts, pickId,
} from '../session.js';

// Index 0 is unused - PBS/items.txt numbers its Pocket field 1..8, and the
// save uses that same number as the @pockets array index (see src/bag.js).
const pocketName = (n) => (n >= 1 && n <= 8 ? t(`bag.pocket${n}`) : t('bag.pocketN', { n }));

// Pockets worth a one-click "give a full set" bulk action: a full healing
// kit, every kind of Poké Ball, and every TM/HM this game declares.
const GIVE_SET_POCKETS = new Set([2, 3, 4]);

export async function loadBag() {
  const { pockets } = await api('/api/bag');
  const body = $('#bagBody');
  body.innerHTML = '';
  for (const p of pockets) {
    if (p.pocket === 0) continue; // unused, mirrors variable/switch index 0
    const pocket = pocketName(p.pocket);
    const card = el('div', 'card');
    const h = el('h3', 'flexhead', pocket);
    h.append(el('small', null, t('bag.count', { n: p.items.length })));
    if (p.items.length || GIVE_SET_POCKETS.has(p.pocket)) h.append(el('span', 'spacer'));
    if (p.items.length) {
      const maxBtn = el('button', 'tiny', t('bag.maxStack'));
      maxBtn.title = t('bag.maxStackTitle');
      maxBtn.onclick = async () => {
        try {
          const r = await api('/api/bag/maxPocket', { method: 'POST', body: JSON.stringify({ pocket: p.pocket }) });
          setDirty(true);
          refreshUndoButtons();
          toast(r.count ? t('bag.maxed', { n: r.count }) : t('bag.alreadyMax'));
          await loadBag();
        } catch (e) { toast(e.message, true); }
      };
      h.append(maxBtn);
    }
    if (GIVE_SET_POCKETS.has(p.pocket)) {
      const giveBtn = el('button', 'tiny', t('bag.giveSet'));
      giveBtn.title = t('bag.giveSetTitle', { pocket });
      giveBtn.onclick = async () => {
        try {
          const r = await api('/api/bag/giveSet', { method: 'POST', body: JSON.stringify({ pocket: p.pocket, qty: 1 }) });
          setDirty(true);
          refreshUndoButtons();
          toast(t('bag.gave', { n: r.count }));
          await loadBag();
        } catch (e) { toast(e.message, true); }
      };
      h.append(giveBtn);
    }
    card.append(h);
    if (!p.items.length) {
      card.append(el('div', 'empty', t('bag.empty')));
    } else {
      const table = el('table', 'table');
      const head = el('tr');
      for (const c of ['', t('bag.colId'), t('bag.colItem'), t('bag.colQty'), '']) head.append(el('th', null, c));
      const thead = el('thead');
      thead.append(head);
      table.append(thead);
      const tbody = el('tbody');
      for (const it of p.items) {
        const tr = el('tr');
        tr.dataset.itemId = String(it.id);
        const iconc = el('td', 'iconcell');
        attachSpriteOrPlaceholder(iconc, itemSpriteUrl(it.internal), it.name, 'sprite item-sprite');
        const idc = el('td');
        idc.append(boundInput(tr, {
          type: 'int', value: it.id, path: it.idPath, scalar: true, label: t('bag.idLabel', { pocket }),
        }));
        const qc = el('td');
        qc.append(boundInput(tr, {
          type: 'int', value: it.qty, path: it.qtyPath, scalar: true, label: t('bag.qtyLabel', { name: it.name || t('bag.item') }),
        }));
        const rmc = el('td', 'actions');
        const rmBtn = el('button', 'tiny danger', t('common.remove'));
        rmBtn.onclick = async () => {
          try {
            await api('/api/item/remove', { method: 'POST', body: JSON.stringify({ pocket: p.pocket, index: it.index }) });
            setDirty(true);
            refreshUndoButtons();
            toast(t('bag.removed', { name: it.name || t('bag.item') }));
            await loadBag();
          } catch (e) { toast(e.message, true); }
        };
        rmc.append(rmBtn);
        tr.append(iconc, idc, el('td', null, it.name || t('bag.unknown')), qc, rmc);
        tbody.append(tr);
      }
      table.append(tbody);
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
      ? t('bag.preview', { qty, name: hit.label })
      : ($('#addItemText2').value.trim() ? t('bag.noMatch') : '');
  };
  $('#addItemText2').oninput = preview;
  $('#addItemQty').oninput = preview;

  $('#addItemGo').onclick = async () => {
    const item = pickId($('#addItemText2').value, itemOpts);
    if (!item) { toast(t('bag.pickItem'), true); return; }
    const qty = Number($('#addItemQty').value) || 1;
    try {
      const r = await api('/api/item/add', { method: 'POST', body: JSON.stringify({ item, qty }) });
      setDirty(true);
      refreshUndoButtons();
      toast(r.stacked
        ? t('bag.nowHave', { qty: r.qty, pocket: pocketName(r.pocket) })
        : t('bag.addedTo', { pocket: pocketName(r.pocket) }));
      await loadBag();
    } catch (e) { toast(e.message, true); }
  };
}
