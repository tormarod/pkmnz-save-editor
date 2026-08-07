// The Party & Boxes tab: per-Pokemon cards (stats, moves, contest, ribbons,
// level editing) plus the "add a Pokemon" form.

import { NATURES } from '../../schema.js';
import { startExperience } from '../../expTable.js';
import { speciesSpriteUrl, itemSpriteUrl, attachSprite } from '../../sprites.js';
import { $, el } from '../dom.js';
import { confirmModal } from '../modal.js';
import {
  api, boundInput, setValue, setDirty, refreshUndoButtons, toast,
  ensureItemOptions, ensureKindOptions, itemOpts, pickId,
} from '../session.js';

let allBoxes = [];
let speciesOpts = [];

// One labelled panel inside a Pokemon card. Its head holds the title and then,
// pushed right by the spacer, whichever bulk actions edit this panel's fields.
function section(title) {
  const panel = el('section', 'subcard');
  const head = el('div', 'flexhead subcard-head');
  head.append(el('h4', 'subcard-title', title), el('span', 'spacer'));
  const body = el('div', 'subcard-body');
  panel.append(head, body);
  return { panel, head, body };
}

function monCard(mon, title, loc) {
  const monName = mon.nickname || mon.speciesName || `species ${mon.species}`;
  const card = el('div', 'card');

  // Header: sprite, who this is, one line of derived facts, then level/HP as
  // tags on the right. Everything you can *do* to it lives in the action row
  // further down, so the identity line stays readable.
  const h = el('div', 'monhead');
  attachSprite(h, speciesSpriteUrl(mon.species), mon.speciesName, 'sprite');
  const ident = el('div', 'monident');
  const nameLine = el('div', 'monhead-name', `${title}  `);
  nameLine.append(el('span', null, mon.speciesName || `species ${mon.species}`));
  ident.append(nameLine);

  const d = mon.describe || {};
  const bits = [];
  if (mon.nickname && mon.nickname !== mon.speciesName) bits.push(`"${mon.nickname}"`);
  if (mon.egg) bits.push('egg');
  if (d.shiny) bits.push('✨ Shiny');
  if (d.gender) bits.push(d.gender);
  if (d.nature) bits.push(d.nature);
  if (d.abilityName) bits.push(d.abilityName);
  if (mon.itemName) bits.push(`holding ${mon.itemName}`);
  if (bits.length) ident.append(el('div', 'monmeta', bits.join(' · ')));
  h.append(ident);

  h.append(el('span', 'spacer'));
  if (mon.level !== null) h.append(el('span', 'tag tag-accent', `Lv ${mon.level}`));
  if (mon.totalhp) h.append(el('span', 'tag tag-outline', `HP ${mon.hp}/${mon.totalhp}`));
  card.append(h);

  const general = section('General');
  const stats = section('Stats');
  const moves = section('Moves');
  const extras = section('Contest & Ribbons');

  // Appended once the Moves panel has its own two buttons, so it reads
  // Restore PP / Relearn / Max PP Ups rather than leading with the last one.
  let maxPPUps = null;

  // The card-level row is only for placement and lifecycle — where this
  // Pokemon lives and whether it exists. Everything that edits a field goes to
  // the head of the panel that shows that field.
  const actions = el('div', 'monactions');
  if (loc) {
    let boxSel = null;
    if (loc.where === 'party') {
      const up = el('button', 'tiny', '▲');
      up.title = 'Move up in party order';
      up.disabled = loc.index === 0;
      up.onclick = async () => {
        try {
          await api('/api/party/swap', { method: 'POST', body: JSON.stringify({ a: loc.index, b: loc.index - 1 }) });
          setDirty(true);
          refreshUndoButtons();
          await loadParty();
        } catch (e) { toast(e.message, true); }
      };
      const down = el('button', 'tiny', '▼');
      down.title = 'Move down in party order';
      down.disabled = loc.index === loc.total - 1;
      down.onclick = async () => {
        try {
          await api('/api/party/swap', { method: 'POST', body: JSON.stringify({ a: loc.index, b: loc.index + 1 }) });
          setDirty(true);
          refreshUndoButtons();
          await loadParty();
        } catch (e) { toast(e.message, true); }
      };
      actions.append(up, down);
      boxSel = el('select', 'inline');
      for (const b of allBoxes) {
        boxSel.append(new Option(`Box ${b.index + 1}${b.name ? ` "${b.name}"` : ''}`, b.index));
      }
      actions.append(boxSel);
    }
    const move = el('button', 'tiny', loc.where === 'party' ? 'To box' : 'To party');
    move.onclick = async () => {
      try {
        await api('/api/pokemon/move', {
          method: 'POST',
          body: JSON.stringify(loc.where === 'party'
            ? { direction: 'toBox', index: loc.index, box: Number(boxSel.value) }
            : { direction: 'toParty', box: loc.box, slot: loc.slot }),
        });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    const del = el('button', 'tiny danger', 'Remove');
    del.onclick = async () => {
      if (!(await confirmModal(`Remove ${monName}? This only takes effect once you write to disk.`, { confirmLabel: 'Remove', danger: true }))) return;
      try {
        await api('/api/pokemon/remove', {
          method: 'POST',
          body: JSON.stringify(loc.where === 'party'
            ? { where: 'party', index: loc.index }
            : { where: 'box', box: loc.box, slot: loc.slot }),
        });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    const maxIVs = el('button', 'tiny', 'Max IVs');
    maxIVs.title = 'Set every IV to 31 and recompute this Pokémon\'s stats';
    maxIVs.onclick = async () => {
      try {
        await api('/api/pokemon/maxIVs', { method: 'POST', body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast(`Maxed IVs for ${monName}`);
      } catch (e) { toast(e.message, true); }
    };
    const recalc = el('button', 'tiny', 'Recalculate stats');
    recalc.title = 'Recompute the cached stats from species, level, IVs, EVs and nature';
    recalc.onclick = async () => {
      try {
        await api('/api/pokemon/recalc', { body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast('Stats recalculated');
      } catch (e) { toast(e.message, true); }
    };
    const maxEVs = el('button', 'tiny', 'Max EVs');
    maxEVs.title = 'Set every EV to 252 and recompute this Pokémon\'s stats';
    maxEVs.onclick = async () => {
      try {
        await api('/api/pokemon/setEVs', { method: 'POST', body: JSON.stringify({ path: mon.path, evs: [252, 252, 252, 252, 252, 252] }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast(`Maxed EVs for ${monName}`);
      } catch (e) { toast(e.message, true); }
    };
    const clearEVs = el('button', 'tiny', 'Clear EVs');
    clearEVs.title = 'Set every EV to 0 and recompute this Pokémon\'s stats';
    clearEVs.onclick = async () => {
      try {
        await api('/api/pokemon/setEVs', { method: 'POST', body: JSON.stringify({ path: mon.path, evs: [0, 0, 0, 0, 0, 0] }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast(`Cleared EVs for ${monName}`);
      } catch (e) { toast(e.message, true); }
    };
    const maxHappiness = el('button', 'tiny', 'Max happiness');
    maxHappiness.title = 'Set friendship to 255';
    maxHappiness.onclick = async () => {
      try {
        await api('/api/pokemon/maxHappiness', { method: 'POST', body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast(`Maxed happiness for ${monName}`);
      } catch (e) { toast(e.message, true); }
    };
    maxPPUps = el('button', 'tiny', 'Max PP Ups');
    maxPPUps.title = 'Set every move\'s PP Ups to 3 and refill PP to match';
    maxPPUps.onclick = async () => {
      try {
        await api('/api/pokemon/maxPPUps', { method: 'POST', body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast(`Maxed PP Ups for ${monName}`);
      } catch (e) { toast(e.message, true); }
    };
    actions.append(move);
    general.head.append(maxHappiness);
    stats.head.append(maxIVs, maxEVs, clearEVs, recalc);
    if (mon.egg) {
      const hatch = el('button', 'tiny', 'Hatch now');
      hatch.title = 'Instantly finish this egg\'s remaining steps and heal it to full HP';
      hatch.onclick = async () => {
        try {
          await api('/api/pokemon/hatch', { method: 'POST', body: JSON.stringify({ path: mon.path }) });
          setDirty(true);
          refreshUndoButtons();
          await loadParty();
          toast(`Hatched ${monName}`);
        } catch (e) { toast(e.message, true); }
      };
      actions.append(hatch);
    }
    actions.append(el('span', 'spacer'), del);
    card.append(actions);
  }

  // The game reads these six straight out of the save, so show what is stored.
  const statLine = el('div', 'statline');
  for (const s of mon.statValues || []) {
    const chip = el('span', 'statchip');
    chip.append(el('b', null, s.name), document.createTextNode(` ${s.value}`));
    statLine.append(chip);
  }
  if (statLine.children.length) stats.body.append(statLine);

  if (mon.totalhp) {
    const track = el('div', 'barTrack');
    const fill = el('div', 'barFill');
    fill.style.width = `${Math.round((mon.hp / mon.totalhp) * 100)}%`;
    track.append(fill);
    stats.body.append(track);
  }

  const grid = el('div', 'grid');

  // The save only stores exp; Level is derived from it via the growth rate
  // (see src/expTable.js), so editing it here writes the equivalent @exp
  // instead of making the user look up an exp value themselves.
  if (mon.level !== null) {
    const row = el('div', 'field');
    const lab = el('label', null, 'Level');
    lab.title = `Growth rate index ${mon.growthRate}. Stored in the save as ${mon.exp} experience.`;
    row.append(lab);
    const inp = el('input');
    inp.type = 'number';
    inp.min = 1;
    inp.max = mon.maxLevel;
    inp.value = mon.level;
    inp.onchange = async () => {
      const lvl = Math.max(1, Math.min(mon.maxLevel, Math.round(Number(inp.value)) || mon.level));
      const exp = startExperience(lvl, mon.growthRate);
      const ok = await setValue(mon.expPath, exp, row, `${monName}: Level`);
      inp.value = ok ? lvl : mon.level;
    };
    row.append(inp);
    row.append(el('span', 'note', `(${mon.exp} exp)`));
    grid.append(row);
  }

  for (const f of mon.fields) {
    const row = el('div', 'field');
    row.append(el('label', null, f.label || f.ivar.replace(/^@/, '')));
    row.append(boundInput(row, { ...f, label: `${monName}: ${f.label || f.ivar.replace(/^@/, '')}` }));
    if (f.resolved) row.append(el('span', 'note', f.resolved));
    if (f.derived) row.append(el('span', 'note', `natural: ${f.derived}`));
    if (f.note) row.append(el('span', 'note', f.note));
    grid.append(row);
  }
  general.body.append(grid);

  // "Spe" for Speed, not "Spd" — too easy to misread as SpD (Sp. Defense).
  const STAT = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'];
  const STAT_HINT = { '@iv': '0–31', '@ev': '0–252, 510 total' };
  for (const s of mon.stats) {
    const wrap = el('div', 'field');
    const statLabel = el('label', null, s.ivar.replace(/^@/, ''));
    if (STAT_HINT[s.ivar]) statLabel.title = `Valid range: ${STAT_HINT[s.ivar]}`;
    wrap.append(statLabel);
    const line = el('div', 'badges');
    s.values.forEach((v, i) => {
      const lab = el('label', null, `${STAT[i] || i} `);
      const inp = el('input');
      inp.type = 'number';
      inp.min = 0;
      inp.max = s.ivar === '@iv' ? 31 : 252;
      inp.value = v.value ?? '';
      inp.style.width = '70px';
      inp.onchange = () => setValue(v.path, Number(inp.value), lab, `${monName}: ${s.ivar.replace(/^@/, '')} ${STAT[i] || i}`);
      lab.append(inp);
      line.append(lab);
    });
    if (STAT_HINT[s.ivar]) line.append(el('span', 'fieldhint', `(${STAT_HINT[s.ivar]})`));
    wrap.append(line);
    stats.body.append(wrap);

    // A 252/252/6 preset spread is the most common competitive EV layout;
    // pick which two stats get 252 and which gets the last 6, rest stay 0.
    if (s.ivar === '@ev') {
      const spread = el('div', 'badges');
      const mkSel = (deflt) => {
        const sel = el('select', 'inline');
        STAT.forEach((name, i) => sel.append(new Option(name, i)));
        sel.value = deflt;
        return sel;
      };
      const selA = mkSel(0);
      const selB = mkSel(1);
      const selC = mkSel(2);
      const applyBtn = el('button', 'tiny', 'Apply 252/252/6 spread');
      applyBtn.title = 'Set two stats to 252 EVs, one to 6, the rest to 0';
      applyBtn.onclick = async () => {
        const evs = [0, 0, 0, 0, 0, 0];
        evs[Number(selA.value)] = 252;
        evs[Number(selB.value)] = 252;
        evs[Number(selC.value)] = 6;
        try {
          await api('/api/pokemon/setEVs', { method: 'POST', body: JSON.stringify({ path: mon.path, evs }) });
          setDirty(true);
          refreshUndoButtons();
          await loadParty();
          toast(`Applied EV spread to ${monName}`);
        } catch (e) { toast(e.message, true); }
      };
      spread.append(el('span', 'fieldhint', '252 in'), selA, el('span', 'fieldhint', '/ 252 in'), selB, el('span', 'fieldhint', '/ 6 in'), selC, applyBtn);
      stats.body.append(spread);
    }
  }

  // Contest stats: plain 0-255 counters. The ivars may not exist yet on this
  // Pokemon (makePokemon() never sets them, and neither does most wild data),
  // so the backend creates them on first edit rather than requiring a value.
  if (mon.contest?.length) {
    const wrap = el('div', 'field');
    wrap.append(el('label', null, 'Contest'));
    const line = el('div', 'badges');
    for (const c of mon.contest) {
      const lab = el('label', null, `${c.label} `);
      const inp = el('input');
      inp.type = 'number';
      inp.min = 0;
      inp.max = 255;
      inp.value = c.value;
      inp.style.width = '60px';
      inp.onchange = async () => {
        const v = Math.max(0, Math.min(255, Math.round(Number(inp.value)) || 0));
        try {
          await api('/api/pokemon/contest', {
            method: 'POST',
            body: JSON.stringify({ path: mon.path, ivar: c.ivar, value: v }),
          });
          setDirty(true);
          refreshUndoButtons();
          inp.value = v;
        } catch (e) { toast(e.message, true); inp.value = c.value; }
      };
      lab.append(inp);
      line.append(lab);
    }
    line.append(el('span', 'fieldhint', '(0–255)'));
    wrap.append(line);
    extras.body.append(wrap);
  }

  // Ribbons: a plain array of ribbon ids. Shown as removable chips with an
  // add-by-id control, since the Raw tree only exposes one array index at a
  // time and this fangame doesn't ship a named ribbon list to pick from.
  const ribbonWrap = el('div', 'field');
  ribbonWrap.append(el('label', null, 'Ribbons'));
  const ribbonLine = el('div', 'badges');
  const renderRibbons = (ids) => {
    ribbonLine.innerHTML = '';
    for (const id of ids) {
      const chip = el('span', 'statchip ribbonchip');
      chip.append(document.createTextNode(`${id} `));
      const rm = el('button', 'tiny danger', '×');
      rm.title = `Remove ribbon ${id}`;
      rm.onclick = async () => {
        try {
          const r = await api('/api/pokemon/ribbons/remove', {
            method: 'POST',
            body: JSON.stringify({ path: mon.path, ribbon: id }),
          });
          setDirty(true);
          refreshUndoButtons();
          renderRibbons(r.ribbons);
        } catch (e) { toast(e.message, true); }
      };
      chip.append(rm);
      ribbonLine.append(chip);
    }
    const addInp = el('input');
    addInp.type = 'number';
    addInp.min = 0;
    addInp.placeholder = 'ribbon id';
    addInp.style.width = '90px';
    const addBtn = el('button', 'tiny', 'Add');
    addBtn.onclick = async () => {
      if (addInp.value === '') return;
      try {
        const r = await api('/api/pokemon/ribbons/add', {
          method: 'POST',
          body: JSON.stringify({ path: mon.path, ribbon: Number(addInp.value) }),
        });
        setDirty(true);
        refreshUndoButtons();
        addInp.value = '';
        renderRibbons(r.ribbons);
      } catch (e) { toast(e.message, true); }
    };
    ribbonLine.append(addInp, addBtn);
  };
  renderRibbons(mon.ribbons || []);
  ribbonWrap.append(ribbonLine);
  extras.body.append(ribbonWrap);

  if (mon.moves.length) {
    const restore = el('button', 'tiny', 'Restore PP');
    restore.title = 'Refill every move to its max PP';
    restore.onclick = async () => {
      try {
        await api('/api/pokemon/moves/restorePP', { method: 'POST', body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    const relearn = el('button', 'tiny', 'Relearn level-up set');
    relearn.title = 'Replace this Pokémon\'s moves with what it would know at its current level';
    relearn.onclick = async () => {
      if (!(await confirmModal(`Replace ${monName}'s moves with the level-up set for its current level?`, { confirmLabel: 'Replace' }))) return;
      try {
        await api('/api/pokemon/moves/relearn', { method: 'POST', body: JSON.stringify({ path: mon.path }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    moves.head.append(restore, relearn);
  }

  if (mon.moves.length) {
    const table = el('table', 'table');
    const head = el('tr');
    for (const c of ['Move', 'PP', 'PP Ups', '']) head.append(el('th', null, c));
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const tbody = el('tbody');
    mon.moves.forEach((m) => {
      const tr = el('tr');
      const namec = el('td');
      namec.append(boundInput(tr, {
        kind: 'moves', value: m.id, path: m.idPath, scalar: true, label: `${monName}: move slot ${m.slot + 1}`,
      }));
      const ppc = el('td');
      ppc.append(boundInput(tr, {
        type: 'int', value: m.pp, path: m.ppPath, scalar: true, label: `${monName}: ${m.name || 'move'} PP`,
      }));
      const ppupc = el('td');
      ppupc.append(boundInput(tr, {
        type: 'int', value: m.ppup, path: m.ppupPath, scalar: true, range: [0, 3], label: `${monName}: ${m.name || 'move'} PP Ups`,
      }));
      const rmc = el('td', 'actions');
      const forget = el('button', 'tiny danger', 'Forget');
      forget.onclick = async () => {
        try {
          await api('/api/pokemon/moves/forget', { method: 'POST', body: JSON.stringify({ path: mon.path, slot: m.slot }) });
          setDirty(true);
          refreshUndoButtons();
          await loadParty();
        } catch (e) { toast(e.message, true); }
      };
      rmc.append(forget);
      tr.append(namec, ppc, ppupc, rmc);
      tbody.append(tr);
    });
    table.append(tbody);
    moves.body.append(table);
  }

  if (mon.moves.length < 4) {
    const addRow = el('div', 'badges');
    const addInp = el('input');
    addInp.type = 'text';
    addInp.setAttribute('list', 'dl-moves');
    addInp.placeholder = 'move to learn';
    addInp.style.width = '160px';
    const addBtn = el('button', 'tiny', 'Learn');
    addBtn.onclick = async () => {
      const opts = await ensureKindOptions('moves');
      const id = pickId(addInp.value, opts);
      if (!id) { toast('Pick a move first', true); return; }
      try {
        await api('/api/pokemon/moves/learn', { method: 'POST', body: JSON.stringify({ path: mon.path, moveId: id }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    addRow.append(addInp, addBtn);
    moves.body.append(addRow);
  }
  if (maxPPUps) moves.head.append(maxPPUps);

  // An egg has no stats to show and may have no moves; skip any panel that
  // ended up with nothing in it rather than printing an empty heading.
  for (const s of [general, stats, moves, extras]) {
    if (s.body.childElementCount) card.append(s.panel);
  }
  return card;
}

function fillBoxPicker() {
  const sel = $('#addBoxNum');
  if (sel.options.length === allBoxes.length && allBoxes.length) return;
  sel.innerHTML = '';
  for (const b of allBoxes) {
    sel.append(new Option(`Box ${b.index + 1}${b.name ? ` "${b.name}"` : ''} — ${b.count}/${b.size}`, b.index));
  }
}

// --- filtering: species, nickname, held item (text) plus shiny/level -----------

function filterActive() {
  return $('#partyFilter').value.trim() !== '' || $('#partyShinyOnly').checked
    || $('#partyLevelMin').value !== '' || $('#partyLevelMax').value !== '';
}

function monMatchesFilter(mon) {
  const q = $('#partyFilter').value.trim().toLowerCase();
  const shinyOnly = $('#partyShinyOnly').checked;
  const minLvl = $('#partyLevelMin').value === '' ? null : Number($('#partyLevelMin').value);
  const maxLvl = $('#partyLevelMax').value === '' ? null : Number($('#partyLevelMax').value);
  if (shinyOnly && !mon.describe?.shiny) return false;
  if (minLvl !== null && (mon.level === null || mon.level < minLvl)) return false;
  if (maxLvl !== null && (mon.level === null || mon.level > maxLvl)) return false;
  if (q) {
    const moveNames = mon.moves.map((m) => m.name).filter(Boolean);
    const hay = [mon.nickname, mon.speciesName, mon.itemName, ...moveNames].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// --- box grid: a compact 6-wide sprite grid, click a slot to expand it ---------
// into the full card below it. Every box is rendered, including empty ones, so
// they can still be renamed/targeted; there are far too many boxes*30 slots to
// keep every Pokemon fully expanded at once the way the party list does.

let partyData = [];
let boxesData = [];
const selectedSlot = {}; // box index -> selected slot number, or null

function boxItem(mon, box) {
  const cell = el('button', 'boxitem');
  cell.type = 'button';
  attachSprite(cell, speciesSpriteUrl(mon.species), mon.speciesName, 'sprite');
  const meta = el('div', 'boxitem-meta');
  meta.append(
    el('div', 'boxitem-species', mon.nickname || mon.speciesName || 'Pokémon'),
    el('div', 'boxitem-level', `Lv ${mon.level ?? '?'}`),
  );
  cell.append(meta);
  cell.title = `${mon.nickname || mon.speciesName || 'Pokémon'} · Lv.${mon.level ?? '?'}`;
  if (mon.describe?.shiny) cell.classList.add('shiny');
  if (filterActive() && !monMatchesFilter(mon)) cell.classList.add('dim');
  if (selectedSlot[box.index] === mon.slot) cell.classList.add('selected');
  cell.onclick = () => {
    selectedSlot[box.index] = selectedSlot[box.index] === mon.slot ? null : mon.slot;
    draw();
  };
  return cell;
}

function boxCard(box) {
  const card = el('div', 'card');
  const bh = el('div', 'flexhead boxhead');
  bh.append(el('span', 'boxlabel', `Box ${box.index + 1}`));

  const nameInp = el('input');
  nameInp.type = 'text';
  nameInp.className = 'boxname';
  nameInp.placeholder = '(unnamed)';
  nameInp.value = box.name || '';
  nameInp.title = 'Box name';
  nameInp.onchange = async () => {
    try {
      await api('/api/box/setField', { method: 'POST', body: JSON.stringify({ box: box.index, field: '@name', value: nameInp.value }) });
      setDirty(true);
      refreshUndoButtons();
      await loadParty();
    } catch (e) { toast(e.message, true); }
  };
  bh.append(nameInp);

  const bgInp = el('input');
  bgInp.type = 'number';
  bgInp.className = 'boxbg';
  bgInp.min = 0;
  bgInp.title = 'Box wallpaper id';
  bgInp.value = box.background ?? 0;
  bgInp.onchange = async () => {
    try {
      await api('/api/box/setField', { method: 'POST', body: JSON.stringify({ box: box.index, field: '@background', value: bgInp.value }) });
      setDirty(true);
      refreshUndoButtons();
      await loadParty();
    } catch (e) { toast(e.message, true); }
  };
  bh.append(el('span', 'fieldhint', 'wallpaper'), bgInp);
  bh.append(el('span', 'fieldhint', `${box.count} of ${box.size}`));
  bh.append(el('span', 'spacer'));
  if (box.count > 1) {
    const sort = el('button', 'tiny', 'Sort box');
    sort.title = 'Sort this box\'s Pokémon by species, compacted to the front';
    sort.onclick = async () => {
      try {
        await api('/api/box/sort', { method: 'POST', body: JSON.stringify({ box: box.index }) });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
        toast(`Sorted box ${box.index + 1}`);
      } catch (e) { toast(e.message, true); }
    };
    bh.append(sort);
  }
  card.append(bh);

  const bySlot = new Map(box.pokemon.map((m) => [m.slot, m]));
  if (box.pokemon.length) {
    const list = el('div', 'boxlist');
    for (const m of [...box.pokemon].sort((a, b) => a.slot - b.slot)) list.append(boxItem(m, box));
    card.append(list);
  } else {
    card.append(el('p', 'boxempty', 'This box is empty.'));
  }

  const selSlot = selectedSlot[box.index];
  const selMon = selSlot === undefined ? null : bySlot.get(selSlot);
  if (selMon) {
    card.append(monCard(selMon, `Box ${box.index + 1} slot ${selMon.slot + 1}`, { where: 'box', box: box.index, slot: selMon.slot }));
  }
  return card;
}

function draw() {
  const body = $('#partyBody');
  body.innerHTML = '';
  const active = filterActive();

  // The party and boxes headings sit on the page rather than in a card, so the
  // cards below them read as the contents of each section.
  const ph = el('div', 'flexhead sectionhead');
  ph.append(el('h3', null, `Party (${partyData.length})`));
  if (partyData.length) {
    ph.append(el('span', 'spacer'));
    const heal = el('button', 'ghost', 'Heal party');
    heal.title = 'Restore every party Pokémon to full HP, cure status, and refill move PP';
    heal.onclick = async () => {
      try {
        const r = await api('/api/party/heal', { method: 'POST', body: '{}' });
        setDirty(true);
        refreshUndoButtons();
        toast(`Healed ${r.healed} Pokémon`);
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    ph.append(heal);

    const candyLevel = el('input');
    candyLevel.type = 'number';
    candyLevel.min = 1;
    candyLevel.max = 100;
    candyLevel.value = 100;
    candyLevel.title = 'Level to set the whole party to';
    candyLevel.className = 'inline';
    candyLevel.style.width = '64px';
    const candy = el('button', 'ghost', 'Rare candy party to level');
    candy.title = 'Set every party Pokémon to this level and recompute stats';
    candy.onclick = async () => {
      try {
        const r = await api('/api/party/rareCandy', { method: 'POST', body: JSON.stringify({ level: Number(candyLevel.value) }) });
        setDirty(true);
        refreshUndoButtons();
        toast(`Set ${r.count} Pokémon to level ${r.level}`);
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    ph.append(candy, candyLevel);
  }
  body.append(ph);
  if (!partyData.length) body.append(el('p', 'empty', 'The party is empty.'));
  const shown = partyData.filter((m) => m && (!active || monMatchesFilter(m)));
  if (active && partyData.length && !shown.length) body.append(el('p', 'empty', 'No party Pokémon match the filter.'));
  partyData.forEach((m, i) => {
    if (!m || (active && !monMatchesFilter(m))) return;
    body.append(monCard(m, `Party ${i + 1}`, { where: 'party', index: i, total: partyData.length }));
  });

  const bh = el('div', 'flexhead sectionhead');
  bh.append(el('h3', null, `Boxes (${boxesData.filter((b) => b.count > 0).length} of ${boxesData.length} in use)`));
  body.append(bh);
  for (const b of boxesData) body.append(boxCard(b));
}

let filterWired = false;
function wirePartyFilter() {
  if (filterWired) return;
  filterWired = true;
  for (const id of ['#partyFilter', '#partyShinyOnly', '#partyLevelMin', '#partyLevelMax']) {
    $(id).addEventListener('input', draw);
  }
}

export async function loadParty() {
  wirePartyFilter();
  await ensureKindOptions('moves');
  const { party } = await api('/api/party');
  const { boxes } = await api('/api/boxes');
  partyData = party;
  boxesData = boxes;
  allBoxes = boxes;
  draw();
  fillBoxPicker();
}

// --- the add form --------------------------------------------------------------

function statInputs(container, def, max) {
  container.innerHTML = '';
  // PBStats order. "Spe" is Speed and "SpD" is Sp. Defense — spelled out in the
  // tooltip because those two are otherwise a keystroke apart.
  const STAT = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD'];
  const FULL = ['HP', 'Attack', 'Defense', 'Speed', 'Sp. Attack', 'Sp. Defense'];
  return STAT.map((label, i) => {
    const inp = el('input');
    inp.type = 'number';
    inp.min = 0;
    inp.max = max;
    inp.title = FULL[i];
    inp.placeholder = label;
    if (def !== null) inp.value = def;
    container.append(inp);
    return inp;
  });
}

let ivInputs = [];
let evInputs = [];

export async function initAddForm() {
  if (speciesOpts.length) return;
  speciesOpts = (await api('/api/options', { body: JSON.stringify({ kind: 'species' }) })).options;
  await ensureItemOptions();
  const sl = $('#speciesList');
  for (const o of speciesOpts) sl.append(new Option(o.label));

  const nat = $('#addNature');
  nat.append(new Option('From personal ID', ''));
  NATURES.forEach((n, i) => nat.append(new Option(`${i} - ${n}`, i)));

  ivInputs = statInputs($('#addIVs'), null, 31);
  evInputs = statInputs($('#addEVs'), 0, 255);

  $('#ivMax').onclick = () => ivInputs.forEach((i) => { i.value = 31; });
  $('#ivRandom').onclick = () => ivInputs.forEach((i) => { i.value = Math.floor(Math.random() * 32); });

  $('#addTarget').onchange = () => {
    $('#addBoxWrap').classList.toggle('hidden', $('#addTarget').value !== 'box');
  };

  const preview = () => {
    const id = pickId($('#addSpeciesText').value, speciesOpts);
    const hit = speciesOpts.find((o) => o.id === id);
    if (!hit) {
      $('#addPreview').textContent = $('#addSpeciesText').value.trim() ? 'No species matches that.' : '';
      return;
    }
    $('#addPreview').textContent = $('#addEgg').checked
      ? `Will create an egg of ${hit.label}.`
      : `Will create ${hit.label} at level ${$('#addLevel').value || '?'}.`;
  };
  $('#addSpeciesText').oninput = preview;
  $('#addLevel').oninput = preview;
  $('#addEgg').onchange = preview;

  $('#addGo').onclick = async () => {
    const species = pickId($('#addSpeciesText').value, speciesOpts);
    if (!species) { toast('Pick a species first', true); return; }
    const ivs = ivInputs.map((i) => i.value);
    const evs = evInputs.map((i) => i.value);
    const body = {
      species,
      level: Number($('#addLevel').value) || 1,
      nickname: $('#addNick').value.trim() || undefined,
      item: pickId($('#addItemText').value, itemOpts),
      iv: ivs.every((v) => v !== '') ? ivs.map(Number) : undefined,
      ev: evs.every((v) => v !== '') ? evs.map(Number) : undefined,
      shiny: $('#addShiny').value === '' ? undefined : $('#addShiny').value === '1',
      gender: $('#addGender').value === '' ? undefined : Number($('#addGender').value),
      nature: $('#addNature').value === '' ? undefined : Number($('#addNature').value),
      ability: $('#addAbility').value === '' ? undefined : Number($('#addAbility').value),
      target: $('#addTarget').value,
      box: Number($('#addBoxNum').value) || 0,
      egg: $('#addEgg').checked,
    };
    try {
      const r = await api('/api/pokemon/add', { method: 'POST', body: JSON.stringify(body) });
      setDirty(true);
      refreshUndoButtons();
      toast(r.where === 'party'
        ? `Added to party slot ${r.index + 1}`
        : `Added to box ${r.box + 1}, slot ${r.slot + 1}`);
      await loadParty();
    } catch (e) { toast(e.message, true); }
  };
}
