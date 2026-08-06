// Typed, labeled projections of a save for the UI tabs. Every entry carries the
// Marshal path it came from, so the UI can write back through the generic
// Save#set without any per-tab save logic.

import {
  SECTIONS, fieldInfo, NATURES, CLASS_FIELDS,
} from './schema.js';
import { labels, nameOf, special } from './labels.js';
import { strToJs, floatText, getIvar as ivar } from './marshal.js';
import { typeOf, isScalar, editValue, preview } from './save.js';
import {
  speciesExists, speciesData, speciesCount, itemInternalName,
} from './gamedata.js';
import { levelFromExperience, MAXLEVEL } from './expTable.js';
import { CONTEST_IVARS, CONTEST_NAMES, describe } from './create.js';

/** The four ivars that force a Pokemon's nature/gender/ability/shininess away from its personal ID. */
export const OVERRIDE_FLAGS = ['@shinyflag', '@genderflag', '@abilityflag', '@natureflag'];

/**
 * What each override dropdown falls back to when left on "Natural" — shown
 * next to the field so that option has a visible meaning instead of just
 * naming where the value comes from.
 */
function derivedFor(name, d) {
  switch (name) {
    case '@genderflag':
      return d.gender === null ? null : (d.gender === 1 ? '♀ Female' : '♂ Male');
    case '@natureflag':
      return NATURES[d.nature] ?? null;
    case '@abilityflag':
      return nameOf('abilities', d.ability) || (d.ability ? `ability ${d.ability}` : null);
    case '@shinyflag':
      return d.shiny ? '✨ Shiny' : 'Not shiny';
    default:
      return null;
  }
}

const S = (key) => SECTIONS.findIndex((s) => s.key === key);
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
  // A switch that has never been touched by an event reads as nil, not
  // false - Ruby treats both as "off", so present it as an unchecked box
  // rather than a blank text field. Otherwise a typed edit would coerce to a
  // String (see coerce() in save.js) instead of the boolean the game expects.
  const isSwitches = sectionKey === 'switches';
  data.items.forEach((v, i) => {
    if (i === 0) return; // index 0 is unused in RPG Maker
    const named = names[i];
    const isDefault = v === null || v === 0 || v === false;
    if (onlySet && !named && isDefault) return;
    const untouchedSwitch = isSwitches && v === null;
    out.push({
      index: i,
      name: named || null,
      label: `${isSwitches ? 'Switch' : 'Variable'} ${i}${named ? ` "${named}"` : ''}`,
      special: special(named),
      type: untouchedSwitch ? 'bool' : typeOf(v),
      value: untouchedSwitch ? false : (isScalar(v) ? editValue(v) : null),
      preview: preview(v),
      scalar: isScalar(v),
      path: [{ k: 's', i: S(sectionKey) }, { k: 'v', name: '@data' }, { k: 'i', i }],
    });
  });
  return out;
}

export const variables = (save, onlySet = false) => indexedList(save, 'variables', 'variables', onlySet);
export const switches = (save, onlySet = false) => indexedList(save, 'switches', 'switches', onlySet);

/** A boundInput()-ready descriptor for one named ivar, or null if it isn't set on this object. */
function describeField(obj, base, cls, name) {
  const v = ivar(obj, name);
  if (v === undefined) return null;
  const info = fieldInfo(cls, name);
  return {
    ivar: name,
    label: info.label,
    note: info.note,
    kind: info.kind,
    options: info.options,
    type: typeOf(v),
    value: isScalar(v) ? editValue(v) : null,
    scalar: isScalar(v),
    preview: preview(v),
    resolved: info.kind && typeof v === 'number' ? nameOf(info.kind, v) : null,
    path: [...base, { k: 'v', name }],
  };
}

/** Trainer scalars plus the badge flags. */
export function trainer(save) {
  const tr = save.section('trainer');
  const base = [{ k: 's', i: S('trainer') }];
  const simple = ['@name', '@id', '@gender', '@money', '@trainertype', '@outfit', '@language',
    '@pokedex', '@pokegear', '@expall', '@metaID'];
  const fields = simple.map((name) => describeField(tr, base, 'PokeBattle_Trainer', name)).filter(Boolean);
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

/** One row per species: its seen/owned Pokedex flags, for the Pokedex tab's filterable list. */
export function dex(save) {
  const tr = save.section('trainer');
  const base = [{ k: 's', i: S('trainer') }];
  const seen = ivar(tr, '@seen');
  const owned = ivar(tr, '@owned');
  const rows = [];
  for (let id = 1; id <= speciesCount(); id++) {
    rows.push({
      index: id,
      name: nameOf('species', id),
      seen: seen?.items?.[id] === true,
      owned: owned?.items?.[id] === true,
      seenPath: [...base, { k: 'v', name: '@seen' }, { k: 'i', i: id }],
      ownedPath: [...base, { k: 'v', name: '@owned' }, { k: 'i', i: id }],
    });
  }
  return rows;
}

/** The player's current map and position - a searchable map field plus raw x/y/direction, for teleporting. */
export function player(save) {
  const p = save.section('player');
  const base = [{ k: 's', i: S('player') }];
  const mapId = save.section('map_id');
  const mapField = {
    ivar: 'map_id',
    label: 'Current map',
    kind: 'maps',
    type: typeOf(mapId),
    value: isScalar(mapId) ? editValue(mapId) : null,
    scalar: isScalar(mapId),
    preview: preview(mapId),
    resolved: nameOf('maps', mapId),
    path: [{ k: 's', i: S('map_id') }],
  };
  const fields = [
    mapField,
    ...['@x', '@y', '@direction'].map((name) => describeField(p, base, 'Game_Player', name)).filter(Boolean),
  ];
  return { fields };
}

/** Every field PokemonGlobalMetadata has labels for: bike/surf/repel/day care/dex/phone state. */
export function world(save) {
  const g = save.section('pokemon_global');
  const base = [{ k: 's', i: S('pokemon_global') }];
  const fields = Object.keys(CLASS_FIELDS.PokemonGlobalMetadata)
    .map((name) => describeField(g, base, 'PokemonGlobalMetadata', name))
    .filter(Boolean);
  return { fields };
}

/** Every field PokemonSystem has labels for: the game's own Options screen. */
export function options(save) {
  const sys = save.section('pokemon_system');
  const base = [{ k: 's', i: S('pokemon_system') }];
  const fields = Object.keys(CLASS_FIELDS.PokemonSystem)
    .map((name) => describeField(sys, base, 'PokemonSystem', name))
    .filter(Boolean);
  return { fields };
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
        index: ii,
        id: num(id),
        name: nameOf('items', num(id)),
        internal: itemInternalName(num(id)),
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
    ppupPath: [...path, { k: 'v', name: '@moves' }, { k: 'i', i }, { k: 'v', name: '@ppup' }],
    slot: i,
  })).filter((m) => m.id);

  const d = describe(mon);

  const field = (name) => {
    const raw = g(name);
    // The four override flags are nil-by-default and the game never sets
    // them unless something explicitly forces the value (see makePokemon in
    // create.js), so most Pokemon simply don't carry the ivar at all. Show
    // the field anyway - "not forced" is a real, meaningful state - and
    // route its writes through setFlagValue (see session.js), which creates
    // the ivar on first use instead of failing to locate it.
    const isFlag = OVERRIDE_FLAGS.includes(name);
    if (raw === undefined && !isFlag) return null;
    const v = raw === undefined ? null : raw;
    const info = fieldInfo('PokeBattle_Pokemon', name);
    return {
      ivar: name,
      label: info.label,
      note: info.note,
      kind: info.kind,
      options: info.options,
      mask: info.mask,
      type: typeOf(v),
      value: isScalar(v) ? editValue(v) : null,
      scalar: isFlag ? true : isScalar(v),
      preview: preview(v),
      resolved: info.kind && typeof v === 'number' ? nameOf(info.kind, v) : null,
      derived: derivedFor(name, d),
      monPath: isFlag ? path : undefined,
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

  // Contest stats and ribbons are only reachable via the Raw tree otherwise,
  // and the ivars may not exist at all on a Pokemon that never entered a
  // contest / earned a ribbon - default to 0 / empty for display, the write
  // side (localApi.js) creates the ivar on first edit if it is missing.
  const contest = CONTEST_IVARS.map((name, i) => ({
    ivar: name,
    label: CONTEST_NAMES[i],
    value: num(g(name)) ?? 0,
  }));
  const ribbons = (g('@ribbons')?.items || []).map(num).filter((v) => v !== null);

  // The game only ever stores exp; level is derived from it via the species'
  // growth rate (levelFromExperience), so compute it here for display and
  // give the UI an @exp path to write through when the user edits the level.
  const exp = num(g('@exp'));
  const growthRate = speciesExists(species) ? speciesData(species).growthRate : null;
  const level = growthRate !== null ? levelFromExperience(exp ?? 0, growthRate) : null;

  return {
    species,
    speciesName: nameOf('species', species),
    nickname: text(g('@name')),
    describe: {
      gender: d.gender === null ? null : (d.gender === 1 ? '♀' : '♂'),
      nature: NATURES[d.nature] ?? null,
      shiny: d.shiny,
      abilityName: nameOf('abilities', d.ability),
    },
    level,
    maxLevel: MAXLEVEL,
    growthRate,
    exp,
    expPath: [...path, { k: 'v', name: '@exp' }],
    statValues,
    hp: num(g('@hp')),
    totalhp: num(g('@totalhp')),
    item: num(g('@item')),
    itemName: nameOf('items', num(g('@item'))),
    itemInternal: itemInternalName(num(g('@item'))),
    egg: (num(g('@eggsteps')) || 0) > 0,
    moves,
    stats,
    contest,
    ribbons,
    fields: ['@species', '@name', '@hp', '@item', '@happiness', '@status',
      '@statusCount', '@eggsteps', '@obtainLevel', '@ballused', '@pokerus', '@markings',
      '@shinyflag', '@genderflag', '@abilityflag', '@natureflag', '@ot', '@otgender', '@obtainMode']
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
