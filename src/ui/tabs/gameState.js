// The Game state tab: every switch and variable in one list, grouped into cards
// and described in plain language.
//
// It replaces the two flat "Variables" and "Switches" tabs. Those showed 1071
// raw Spanish dev names with no explanation - a player could guess
// "Segunda Medalla", but nobody could guess that "Cartel Torre Oscura" is the
// shiny flag or that "NUMERITOS" is inverted. The descriptions come from
// data/annotations.json, baked into the bundle at build time.

import { $, el, boolToggle } from '../dom.js';
import { api, boundInput, setValue } from '../session.js';
import { groupInfo, groupOrder, groupsOpen } from '../../labels.js';
import { t, pick } from '../../i18n.js';

// Tags that carry a number in their label.
const COUNTED = { wide: (r) => r.mapCount };
// Order tags appear in, most decision-relevant first.
const TAG_ORDER = ['inverted', 'script', 'wide', 'dead', 'reserved', 'computed'];

let rows = [];
let total = 0;
const collapsed = new Set();

/** The label a row shows: the curated one, or the dev name when there is none. */
const labelOf = (r) => pick({ es: r.es, en: r.en })?.n || r.name || null;
const descOf = (r) => pick({ es: r.es, en: r.en })?.d || null;

/** A switch is a boolean, so it gets the same On/Off pill every other boolean does. */
function switchToggle(host, r) {
  const { label, input } = boolToggle(r.value === true);
  input.onchange = async () => {
    if (!await setValue(r.path, input.checked, host, r.label)) input.checked = !input.checked;
  };
  return label;
}

function tagPills(r) {
  const wrap = el('span', 'gs-tags');
  for (const name of TAG_ORDER) {
    if (!r.tags?.includes(name)) continue;
    const n = COUNTED[name]?.(r);
    const pill = el('span', `tag tag-${name}`, t(`tag.${name}`, { n }));
    pill.title = t(`tag.${name}Hint`, { n });
    wrap.append(pill);
  }
  return wrap;
}

function rowEl(r) {
  const row = el('div', `gs-row${r.tags?.includes('dead') ? ' gs-dead' : ''}`);
  row.dataset.kind = r.kind;
  row.dataset.index = String(r.index);

  const head = el('div', 'gs-head');
  head.append(el('span', 'gs-id', `#${r.index}`));

  const label = labelOf(r);
  head.append(el('span', `gs-label${label ? '' : ' unnamed'}`, label || '—'));
  // Only worth showing when it says something the label does not - a
  // capitalisation difference ("Segunda Medalla" vs "Segunda medalla") is noise.
  const same = label && r.name && label.toLowerCase() === r.name.toLowerCase();
  if (r.name && !same) head.append(el('span', 'gs-dev', r.name));
  head.append(tagPills(r));
  row.append(head);

  const d = descOf(r);
  if (d) row.append(el('p', 'gs-desc', d));

  if (r.mapId) {
    row.append(el('p', 'gs-map', t('gamestate.mapLine', { id: r.mapId, name: r.mapName || '?' })));
  }

  const control = el('div', 'gs-control');
  if (r.kind === 'switch') {
    control.append(switchToggle(row, r));
  } else {
    const input = boundInput(row, r);
    // A variable no event has touched yet is nil; show an em-dash placeholder
    // so typing still writes a value.
    if (input.tagName === 'INPUT' && input.value === '') input.placeholder = '—';
    control.append(input);
  }
  row.append(control);
  return row;
}

function card(key, list, listEl) {
  const info = groupInfo()[key] || {};
  const title = pick(info) || key;
  const isOpen = !collapsed.has(key);

  const section = el('section', `gs-card${isOpen ? '' : ' gs-closed'}`);
  const header = el('button', 'gs-cardhead');
  header.type = 'button';
  header.setAttribute('aria-expanded', String(isOpen));
  header.append(el('span', 'gs-caret', isOpen ? '▾' : '▸'));
  header.append(el('span', 'gs-title', title));
  header.append(el('span', 'gs-count', t('gamestate.count', { n: list.length })));
  header.onclick = () => {
    if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
    draw();
  };
  section.append(header);

  if (isOpen) {
    const body = el('div', 'gs-body');
    // The eighteen amulets only make sense next to the step counter they share.
    if (key === 'amulets') body.append(el('p', 'gs-note', t('gamestate.amuletNote')));
    for (const r of list) body.append(rowEl(r));
    section.append(body);
  }
  listEl.append(section);
}

function matches(r, q) {
  if (!q) return true;
  if (String(r.index).includes(q)) return true;
  if ((r.name || '').toLowerCase().includes(q)) return true;
  if ((labelOf(r) || '').toLowerCase().includes(q)) return true;
  return (descOf(r) || '').toLowerCase().includes(q);
}

function draw() {
  const listEl = $('#gsList');
  const q = $('#gsFilter').value.trim().toLowerCase();
  const group = $('#gsGroup').value;
  const showDead = $('#gsShowDead').checked;

  listEl.innerHTML = '';
  const shown = rows.filter((r) => (showDead || !r.tags?.includes('dead'))
    && (!group || r.group === group)
    && matches(r, q));

  const hidden = total - rows.length;
  $('#gsCount').textContent = (q || group)
    ? t('gamestate.shownOf', { shown: shown.length, total: rows.length })
    : `${t('gamestate.shown', { shown: shown.length })}${hidden > 0 ? ` · ${t('gamestate.atDefault', { n: hidden })}` : ''}`;

  if (!shown.length) { listEl.append(el('p', 'empty', t('gamestate.nothing'))); return; }

  // 1200 rows is where rendering starts to cost a visible pause; the search and
  // group filter are the way through a list this size.
  const capped = shown.slice(0, 1200);
  const byGroup = new Map();
  for (const r of capped) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  for (const key of groupOrder()) {
    const list = byGroup.get(key);
    if (list?.length) card(key, list, listEl);
  }
  // Any group the bundle did not list, so a row can never vanish silently.
  for (const [key, list] of byGroup) {
    if (!groupOrder().includes(key)) card(key, list, listEl);
  }

  if (shown.length > capped.length) {
    listEl.append(el('p', 'trunc', t('gamestate.more', { n: shown.length - capped.length })));
  }
}

/** Fill the group dropdown from the bundle, in card order. */
function fillGroups(present) {
  const sel = $('#gsGroup');
  sel.innerHTML = '';
  sel.append(new Option(t('gamestate.allGroups'), ''));
  for (const key of groupOrder()) {
    if (!present.has(key)) continue;
    sel.append(new Option(pick(groupInfo()[key]) || key, key));
  }
}

export async function loadGameState() {
  const r = await api('/api/gamestate', { body: JSON.stringify({ onlySet: $('#gsOnlySet').checked }) });
  rows = r.rows;
  total = r.total;
  fillGroups(new Set(rows.map((x) => x.group)));
  // Story chapters start collapsed - there are twenty of them and they are
  // bookkeeping; the gameplay cards are what a player came for.
  collapsed.clear();
  const open = new Set(groupsOpen());
  for (const key of new Set(rows.map((x) => x.group))) {
    if (!open.has(key)) collapsed.add(key);
  }
  draw();
}

export function initGameStateTab() {
  $('#gsFilter').oninput = draw;
  $('#gsGroup').onchange = draw;
  $('#gsShowDead').onchange = draw;
  $('#gsOnlySet').onchange = loadGameState;
}

/**
 * Bring one entry into view for the global search: clear whatever filter is
 * hiding it, open its card, and hand the row back so the caller can flash it.
 */
export function revealEntry(kind, index) {
  const row = rows.find((r) => r.kind === kind && r.index === index);
  if (!row) return null;
  $('#gsFilter').value = String(index);
  $('#gsGroup').value = '';
  // A dead entry is hidden by default; searching for it by name should still
  // find it rather than silently showing nothing.
  if (row.tags?.includes('dead')) $('#gsShowDead').checked = true;
  collapsed.delete(row.group);
  draw();
  return document.querySelector(`#gsList .gs-row[data-kind="${kind}"][data-index="${index}"]`);
}
