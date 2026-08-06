// Typed, labeled projections of a save for the UI tabs. Every entry carries the
// Marshal path it came from, so the UI can write back through the generic
// Save#set without any per-tab save logic.

import { SECTIONS } from './schema.js';
import { labels, nameOf } from './labels.js';
import { strToJs, floatText } from './marshal.js';
import { typeOf, isScalar, editValue, preview } from './save.js';

const S = (key) => SECTIONS.findIndex((s) => s.key === key);
const ivar = (o, n) => (o && o.ivars ? o.ivars.find(([k]) => k === n)?.[1] : undefined);
const num = (v) => (typeof v === 'number' ? v : null);
const text = (v) => (v && v.t === 'str' ? strToJs(v) : null);

/** The save slot the game will write back to. See variable 99, "NO TOCAR". */
export const SLOT_VAR = 99;

export function slotOf(save) {
  const data = ivar(save.section('variables'), '@data');
  return data ? num(data.items[SLOT_VAR]) : null;
}

/** The filename this save will write itself to, per pbSave(). */
export function expectedFile(slot) {
  return slot > 1 ? `Game_${slot}.rxdata` : 'Game.rxdata';
}

export function summary(save) {
  const tr = save.section('trainer');
  const frames = save.section('frame_count');
  const mapId = save.section('map_id');
  const slot = slotOf(save);
  const secs = typeof frames === 'number' ? Math.floor(frames / 40) : 0;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    file: save.file,
    slot,
    expectedFile: expectedFile(slot),
    slotMismatch: expectedFile(slot) !== save.file,
    trainerName: text(ivar(tr, '@name')),
    money: num(ivar(tr, '@money')),
    badges: (ivar(tr, '@badges')?.items || []).filter((b) => b === true).length,
    partyCount: ivar(tr, '@party')?.items.length ?? 0,
    playTime: `${Math.floor(secs / 3600)}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`,
    mapId,
    mapName: nameOf('maps', mapId),
    saveCount: num(ivar(save.section('game_system'), '@save_count')),
  };
}

/** Variables and switches, named from Data/System.rxdata. */
function indexedList(save, sectionKey, labelTable, onlySet) {
  const data = ivar(save.section(sectionKey), '@data');
  if (!data) return [];
  const names = labels()[labelTable];
  const out = [];
  data.items.forEach((v, i) => {
    if (i === 0) return; // index 0 is unused in RPG Maker
    const named = names[i];
    const isDefault = v === null || v === 0 || v === false;
    if (onlySet && !named && isDefault) return;
    out.push({
      index: i,
      name: named || null,
      type: typeOf(v),
      value: isScalar(v) ? editValue(v) : null,
      preview: preview(v),
      scalar: isScalar(v),
      path: [{ k: 's', i: S(sectionKey) }, { k: 'v', name: '@data' }, { k: 'i', i }],
    });
  });
  return out;
}

export const variables = (save, onlySet = false) => indexedList(save, 'variables', 'variables', onlySet);
export const switches = (save, onlySet = false) => indexedList(save, 'switches', 'switches', onlySet);

/** Trainer scalars plus the badge flags. */
export function trainer(save) {
  const tr = save.section('trainer');
  const base = [{ k: 's', i: S('trainer') }];
  const simple = ['@name', '@money', '@trainertype', '@outfit', '@language',
    '@pokedex', '@pokegear', '@expall', '@metaID'];
  const fields = [];
  for (const name of simple) {
    const v = ivar(tr, name);
    if (v === undefined) continue;
    fields.push({
      ivar: name,
      type: typeOf(v),
      value: isScalar(v) ? editValue(v) : null,
      scalar: isScalar(v),
      preview: preview(v),
      resolved: name === '@trainertype' ? nameOf('trainerTypes', v) : null,
      path: [...base, { k: 'v', name }],
    });
  }
  const badges = (ivar(tr, '@badges')?.items || []).map((b, i) => ({
    index: i,
    value: b === true,
    path: [...base, { k: 'v', name: '@badges' }, { k: 'i', i }],
  }));
  const dex = ['@seen', '@owned'].map((name) => {
    const arr = ivar(tr, name);
    return { ivar: name, count: (arr?.items || []).filter((x) => x === true).length, total: (arr?.items?.length ?? 1) - 1 };
  });
  return { fields, badges, dex };
}

/** Bag pockets with item names resolved from PBS/items.txt. */
export function bag(save) {
  const b = save.section('bag');
  const pockets = ivar(b, '@pockets');
  const base = [{ k: 's', i: S('bag') }, { k: 'v', name: '@pockets' }];
  const out = [];
  (pockets?.items || []).forEach((pocket, pi) => {
    if (!pocket || pocket.t !== 'array') return;
    const items = pocket.items.map((entry, ii) => {
      const id = entry?.items?.[0];
      const qty = entry?.items?.[1];
      const p = [...base, { k: 'i', i: pi }, { k: 'i', i: ii }];
      return {
        id: num(id),
        name: nameOf('items', num(id)),
        qty: num(qty),
        idPath: [...p, { k: 'i', i: 0 }],
        qtyPath: [...p, { k: 'i', i: 1 }],
      };
    });
    out.push({ pocket: pi, items });
  });
  return out;
}

/** One Pokemon, flattened for the UI. */
function pokemon(mon, path) {
  if (!mon || mon.t !== 'obj') return null;
  const g = (n) => ivar(mon, n);
  const species = num(g('@species'));
  const moves = (g('@moves')?.items || []).map((m, i) => ({
    id: num(ivar(m, '@id')),
    name: nameOf('moves', num(ivar(m, '@id'))),
    pp: num(ivar(m, '@pp')),
    ppup: num(ivar(m, '@ppup')),
    idPath: [...path, { k: 'v', name: '@moves' }, { k: 'i', i }, { k: 'v', name: '@id' }],
    ppPath: [...path, { k: 'v', name: '@moves' }, { k: 'i', i }, { k: 'v', name: '@pp' }],
  })).filter((m) => m.id);

  const field = (name) => {
    const v = g(name);
    if (v === undefined) return null;
    return {
      ivar: name,
      type: typeOf(v),
      value: isScalar(v) ? editValue(v) : null,
      scalar: isScalar(v),
      preview: preview(v),
      path: [...path, { k: 'v', name }],
    };
  };

  const stats = ['@iv', '@ev'].map((name) => ({
    ivar: name,
    values: (g(name)?.items || []).map((v, i) => ({
      value: num(v),
      path: [...path, { k: 'v', name }, { k: 'i', i }],
    })),
  }));

  // The six stats the game caches in the save and reads back directly.
  const STAT_IVARS = ['@totalhp', '@attack', '@defense', '@speed', '@spatk', '@spdef'];
  const STAT_NAMES = ['HP', 'Atk', 'Def', 'Spe', 'SpA', 'SpD']; // Spe = Speed
  const statValues = STAT_IVARS.map((name, i) => ({ name: STAT_NAMES[i], value: num(g(name)) }));

  return {
    species,
    speciesName: nameOf('species', species),
    nickname: text(g('@name')),
    level: null, // the game derives level from exp; shown as exp instead
    exp: num(g('@exp')),
    statValues,
    hp: num(g('@hp')),
    totalhp: num(g('@totalhp')),
    item: num(g('@item')),
    itemName: nameOf('items', num(g('@item'))),
    egg: (num(g('@eggsteps')) || 0) > 0,
    moves,
    stats,
    fields: ['@species', '@name', '@exp', '@hp', '@item', '@happiness', '@status',
      '@statusCount', '@eggsteps', '@obtainLevel', '@ballused', '@pokerus',
      '@shinyflag', '@genderflag', '@abilityflag', '@natureflag', '@ot']
      .map(field).filter(Boolean),
    path,
  };
}

export function party(save) {
  const p = ivar(save.section('trainer'), '@party');
  const base = [{ k: 's', i: S('trainer') }, { k: 'v', name: '@party' }];
  return (p?.items || []).map((mon, i) => pokemon(mon, [...base, { k: 'i', i }]));
}

export function boxes(save) {
  const st = save.section('storage');
  const bs = ivar(st, '@boxes');
  const base = [{ k: 's', i: S('storage') }, { k: 'v', name: '@boxes' }];
  return (bs?.items || []).map((box, bi) => {
    const mons = ivar(box, '@pokemon');
    const bpath = [...base, { k: 'i', i: bi }];
    // Keep the real slot number: boxes are 30 fixed slots and may have holes.
    const list = (mons?.items || [])
      .map((mon, mi) => (mon
        ? { slot: mi, ...pokemon(mon, [...bpath, { k: 'v', name: '@pokemon' }, { k: 'i', i: mi }]) }
        : null))
      .filter(Boolean);
    return {
      index: bi,
      name: text(ivar(box, '@name')),
      size: mons?.items.length ?? 0,
      count: list.length,
      pokemon: list,
    };
  });
}

export { floatText };
