// The Variables and Switches tabs: both are flat, filterable, indexed lists
// with the same shape, so one factory builds both.

import { $, el, boolToggle } from '../dom.js';
import { api, boundInput, setValue } from '../session.js';

const SPECIAL_TAG = { reserved: 'reserved', computed: 'script condition' };
const SPECIAL_HINT = {
  reserved: 'Blocked out by the developers for future use. Nothing currently reads it, so editing it is harmless but has no visible effect.',
  computed: "Pokémon Essentials' built-in placeholder name for a scripted condition (time of day, day of week, ...). "
    + "The game evaluates that expression directly and does not read this switch's stored value, "
    + 'so toggling it here will not change anything in-game.',
};

// A switch is a boolean, so it gets the same On/Off pill every other boolean
// in the app does, rather than a text box.
function switchToggle(tr, r) {
  const { label, input } = boolToggle(r.value === true);
  input.onchange = async () => {
    if (!await setValue(r.path, input.checked, tr, r.label)) input.checked = !input.checked;
  };
  return label;
}

export function makeIndexedTab(kind, listSel, filterSel, onlySel, countSel) {
  let rows = [];
  let total = 0;
  const listEl = $(listSel);
  const isSwitches = kind === 'switches';

  const draw = () => {
    const q = $(filterSel).value.trim().toLowerCase();
    listEl.innerHTML = '';
    const shown = rows.filter((r) =>
      !q || String(r.index).includes(q) || (r.name || '').toLowerCase().includes(q));

    const hidden = total - rows.length;
    $(countSel).textContent = q
      ? `${shown.length} of ${rows.length} shown`
      : `${rows.length} shown${hidden > 0 ? ` · ${hidden} left at default` : ''}`;

    if (!shown.length) { listEl.append(el('p', 'empty', 'Nothing matches.')); return; }

    const table = el('table', 'table');
    const head = el('tr');
    head.append(el('th', 'colidx', '#'), el('th', null, 'Name'), el('th', 'colval', 'Value'));
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const body = el('tbody');
    for (const r of shown.slice(0, 1200)) {
      const tr = el('tr');
      tr.append(el('td', 'idx', String(r.index)));

      const nameCell = el('td');
      const nmWrap = el('span', 'nmwrap');
      const nm = el('span', `nm${r.name ? '' : ' unnamed'}`, r.name || '—');
      nmWrap.append(nm);
      if (r.special) {
        nm.title = SPECIAL_HINT[r.special];
        const tag = el('span', `tag tag-${r.special}`, SPECIAL_TAG[r.special]);
        tag.title = SPECIAL_HINT[r.special];
        nmWrap.append(tag);
      }
      nameCell.append(nmWrap);
      tr.append(nameCell);

      const valCell = el('td');
      const control = isSwitches ? switchToggle(tr, r) : boundInput(tr, r);
      // A variable no event has touched yet is nil; show the same em-dash an
      // unnamed row gets, as a placeholder so typing still writes a value.
      if (control.tagName === 'INPUT' && control.value === '') control.placeholder = '—';
      valCell.append(control);
      tr.append(valCell);
      body.append(tr);
    }
    table.append(body);
    listEl.append(table);
    if (shown.length > 1200) listEl.append(el('p', 'trunc', `…${shown.length - 1200} more, narrow the filter`));
  };

  const load = async () => {
    const r = await api(`/api/${kind}`, { body: JSON.stringify({ onlySet: $(onlySel).checked }) });
    rows = r.rows;
    total = r.total;
    draw();
  };

  $(filterSel).oninput = draw;
  $(onlySel).onchange = load;
  return load;
}
