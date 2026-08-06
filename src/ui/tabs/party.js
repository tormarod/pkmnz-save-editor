// The Party & Boxes tab: per-Pokemon cards (stats, moves, contest, ribbons,
// level editing) plus the "add a Pokemon" form.

import { NATURES } from '../../schema.js';
import { startExperience } from '../../expTable.js';
import { speciesSpriteUrl, itemSpriteUrl, attachSprite } from '../../sprites.js';
import { $, el } from '../dom.js';
import {
  api, boundInput, setValue, setDirty, refreshUndoButtons, toast,
  ensureItemOptions, itemOpts, pickId,
} from '../session.js';

let allBoxes = [];
let speciesOpts = [];

function monCard(mon, title, loc) {
  const monName = mon.nickname || mon.speciesName || `species ${mon.species}`;
  const card = el('div', 'card');
  const h = el('h3', 'monhead');
  attachSprite(h, speciesSpriteUrl(mon.species), mon.speciesName, 'sprite');
  h.append(document.createTextNode(`${title}  ${mon.speciesName || `species ${mon.species}`}`));
  const bits = [];
  if (mon.nickname && mon.nickname !== mon.speciesName) bits.push(`"${mon.nickname}"`);
  if (mon.egg) bits.push('egg');
  if (mon.itemName) bits.push(`holding ${mon.itemName}`);
  bits.push(`HP ${mon.hp}/${mon.totalhp}`);
  h.append(el('small', null, bits.join(' · ')));

  const d = mon.describe || {};
  const dbits = [];
  if (d.gender) dbits.push(d.gender);
  if (d.nature) dbits.push(d.nature);
  if (d.shiny) dbits.push('✨ Shiny');
  if (d.abilityName) dbits.push(d.abilityName);
  if (dbits.length) h.append(el('small', null, dbits.join(' · ')));

  if (loc) {
    h.append(el('span', 'spacer'));
    const move = el('button', 'tiny', loc.where === 'party' ? 'To box' : 'To party');
    move.onclick = async () => {
      try {
        await api('/api/pokemon/move', {
          method: 'POST',
          body: JSON.stringify(loc.where === 'party'
            ? { direction: 'toBox', index: loc.index, box: 0 }
            : { direction: 'toParty', box: loc.box, slot: loc.slot }),
        });
        setDirty(true);
        refreshUndoButtons();
        await loadParty();
      } catch (e) { toast(e.message, true); }
    };
    const del = el('button', 'tiny danger', 'Remove');
    del.onclick = async () => {
      if (!confirm(`Remove ${monName}? This only takes effect once you write to disk.`)) return;
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
    h.append(move, maxIVs, recalc, del);
  }
  card.append(h);

  // The game reads these six straight out of the save, so show what is stored.
  const statLine = el('div', 'statline');
  for (const s of mon.statValues || []) {
    const chip = el('span', 'statchip');
    chip.append(el('b', null, s.name), document.createTextNode(` ${s.value}`));
    statLine.append(chip);
  }
  if (statLine.children.length) card.append(statLine);

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
  card.append(grid);

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
    card.append(wrap);
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
    card.append(wrap);
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
  card.append(ribbonWrap);

  if (mon.moves.length) {
    const table = el('table', 'items');
    const head = el('tr');
    for (const c of ['ID', 'Move', 'PP']) head.append(el('th', null, c));
    table.append(head);
    mon.moves.forEach((m, i) => {
      const tr = el('tr');
      const idc = el('td');
      idc.append(boundInput(tr, {
        type: 'int', value: m.id, path: m.idPath, scalar: true, label: `${monName}: move ${i + 1}`,
      }));
      const ppc = el('td');
      ppc.append(boundInput(tr, {
        type: 'int', value: m.pp, path: m.ppPath, scalar: true, label: `${monName}: ${m.name || `move ${i + 1}`} PP`,
      }));
      tr.append(idc, el('td', null, m.name || '(unknown)'), ppc);
      table.append(tr);
    });
    card.append(table);
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

export async function loadParty() {
  const body = $('#partyBody');
  body.innerHTML = '';
  const { party } = await api('/api/party');
  const pc = el('div', 'card');
  const ph = el('h3', 'flexhead', `Party (${party.length})`);
  if (party.length) {
    ph.append(el('span', 'spacer'));
    const heal = el('button', 'tiny', 'Heal party');
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
  }
  pc.append(ph);
  body.append(pc);
  if (!party.length) pc.append(el('div', 'empty', 'The party is empty.'));
  party.forEach((m, i) => m && body.append(monCard(m, `Party ${i + 1}`, { where: 'party', index: i })));

  const { boxes } = await api('/api/boxes');
  allBoxes = boxes;
  const filled = boxes.filter((b) => b.count > 0);
  const bc = el('div', 'card');
  bc.append(el('h3', null, `Boxes (${filled.length} of ${boxes.length} in use)`));
  body.append(bc);
  if (!filled.length) bc.append(el('div', 'empty', 'All boxes are empty.'));
  for (const b of filled) {
    const bh = el('div', 'flexhead boxhead');
    bh.append(el('span', null, `Box ${b.index + 1}${b.name ? ` "${b.name}"` : ''}: ${b.count} of ${b.size}`));
    if (b.count > 1) {
      const sort = el('button', 'tiny', 'Sort box');
      sort.title = 'Sort this box\'s Pokémon by species, compacted to the front';
      sort.onclick = async () => {
        try {
          await api('/api/box/sort', { method: 'POST', body: JSON.stringify({ box: b.index }) });
          setDirty(true);
          refreshUndoButtons();
          await loadParty();
          toast(`Sorted box ${b.index + 1}`);
        } catch (e) { toast(e.message, true); }
      };
      bh.append(sort);
    }
    body.append(bh);
    b.pokemon.forEach((m) => body.append(
      monCard(m, `Box ${b.index + 1} slot ${m.slot + 1}`, { where: 'box', box: b.index, slot: m.slot }),
    ));
  }
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
    $('#addPreview').textContent = hit
      ? `Will create ${hit.label} at level ${$('#addLevel').value || '?'}.`
      : ($('#addSpeciesText').value.trim() ? 'No species matches that.' : '');
  };
  $('#addSpeciesText').oninput = preview;
  $('#addLevel').oninput = preview;

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
