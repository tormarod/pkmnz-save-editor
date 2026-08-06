// The Variables and Switches tabs: both are flat, filterable, indexed lists
// with the same shape, so one factory builds both.

import { $, el } from '../dom.js';
import { api, boundInput } from '../session.js';

const SPECIAL_TAG = { reserved: 'reserved', computed: 'script condition' };
const SPECIAL_HINT = {
  reserved: 'Blocked out by the developers for future use. Nothing currently reads it, so editing it is harmless but has no visible effect.',
  computed: "Pokémon Essentials' built-in placeholder name for a scripted condition (time of day, day of week, ...). "
    + "The game evaluates that expression directly and does not read this switch's stored value, "
    + 'so toggling it here will not change anything in-game.',
};

export function makeIndexedTab(kind, listSel, filterSel, onlySel) {
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
