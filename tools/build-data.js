// Bakes everything the editor needs to know about Pokemon Z into a single
// JSON bundle, so the published site never touches the user's filesystem.
//
//   node tools/build-data.js "C:/path/to/Pokemon Z"
//   PKMNZ_GAME_DIR="C:/path/to/Pokemon Z" node tools/build-data.js
//
// Sources, all from the game install:
//   Data/System.rxdata    variable and switch names (the RPG Maker editor names)
//   Data/MapInfos.rxdata  map names
//   Data/dexdata.dat      base stats, gender rate, happiness, growth rate, base exp
//   PBS/*.txt             species / item / move / ability / trainer-type / type
//                         names, level-up movesets, types, EVs, egg groups/moves/
//                         hatch steps, height/weight/kind/dex text, evolutions,
//                         and form names

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, strToJs, getIvar as ivar } from '../src/marshal.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'data', 'gamedata.json');

const GAME_DIR = process.argv[2] || process.env.PKMNZ_GAME_DIR;
if (!GAME_DIR) {
  console.error('usage: node tools/build-data.js "<path to the Pokemon Z folder>"');
  process.exit(2);
}
if (!existsSync(join(GAME_DIR, 'Data', 'System.rxdata'))) {
  console.error(`not a game folder (no Data/System.rxdata): ${GAME_DIR}`);
  process.exit(2);
}

const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const text = (rel) => {
  const p = join(GAME_DIR, rel);
  return existsSync(p) ? stripBom(readFileSync(p, 'utf8')) : null;
};
const rx = (rel) => {
  const p = join(GAME_DIR, rel);
  return existsSync(p) ? loadAll(new Uint8Array(readFileSync(p)))[0].value : null;
};
// --- names from Data/System.rxdata -------------------------------------------
const sys = rx('Data/System.rxdata');
const namesFrom = (which) => {
  const arr = ivar(sys, which);
  const out = {};
  if (arr?.t === 'array') {
    arr.items.forEach((v, i) => {
      const s = v && v.t === 'str' ? strToJs(v).trim() : '';
      if (s) out[i] = s;
    });
  }
  return out;
};

// --- map names ---------------------------------------------------------------
const mapInfo = rx('Data/MapInfos.rxdata');
const maps = {};
if (mapInfo?.t === 'hash') {
  for (const [k, v] of mapInfo.entries) {
    const nm = ivar(v, '@name');
    if (typeof k === 'number' && nm?.t === 'str') maps[k] = strToJs(nm);
  }
}

// --- simple `id,INTERNAL,Display,...` PBS lists -------------------------------
function pbsList(rel, extra) {
  const t = text(rel);
  const out = {};
  if (!t) return out;
  for (const line of t.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const p = line.split(',');
    const id = Number(p[0]);
    if (!Number.isFinite(id)) continue;
    out[id] = { n: (p[2] || p[1] || '').trim(), i: (p[1] || '').trim(), ...(extra ? extra(p) : null) };
  }
  return out;
}

// Pocket is field 5 (1-based) of items.txt: id,InternalName,Name,NamePlural,Pocket,...
const items = pbsList('PBS/items.txt', (p) => ({ pocket: Number(p[4]) || 0 }));
const moves = pbsList('PBS/moves.txt', (p) => ({ pp: Number(p[8]) || 5 }));
const abilities = pbsList('PBS/abilities.txt');
const trainerTypes = pbsList('PBS/trainertypes.txt');

const moveByName = new Map(Object.entries(moves).map(([id, m]) => [m.i, Number(id)]));
const abilityByName = new Map(Object.entries(abilities).map(([id, a]) => [a.i, Number(id)]));

// --- [n]-bracketed PBS files (pokemon.txt, types.txt): parse the requested
// key=value lines into one object per bracket section.
function pbsSections(rel, keys) {
  const t = text(rel) || '';
  const out = {};
  const re = new RegExp(`^(${keys.join('|')})\\s*=\\s*(.*)$`);
  let cur = null;
  for (const line of t.split(/\r?\n/)) {
    const sec = /^\[(\d+)\]/.exec(line);
    if (sec) { cur = Number(sec[1]); out[cur] = {}; continue; }
    if (cur === null) continue;
    const m = re.exec(line);
    if (m) out[cur][m[1]] = m[2].trim();
  }
  return out;
}

// --- types.txt -----------------------------------------------------------------
const pbsTypes = pbsSections('PBS/types.txt', ['Name', 'InternalName']);
const types = {};
for (const [id, t] of Object.entries(pbsTypes)) types[id] = { n: t.Name || `TYPE${id}`, i: t.InternalName || '' };
const typeByInternal = new Map(Object.entries(pbsTypes).map(([id, t]) => [t.InternalName, Number(id)]));

// --- species: names + level-up moves from PBS, numbers from dexdata.dat -------
const RECORD = 76;
const OFF = { baseStats: 10, genderRate: 18, happiness: 19, growthRate: 20, baseExp: 38 };
const dex = new Uint8Array(readFileSync(join(GAME_DIR, 'Data/dexdata.dat')));
const speciesCount = Math.floor(dex.length / RECORD);

const pbsSpecies = pbsSections('PBS/pokemon.txt', [
  'Name', 'InternalName', 'Type1', 'Type2', 'Moves', 'Abilities', 'HiddenAbility',
  'EffortPoints', 'Compatibility', 'EggMoves', 'StepsToHatch', 'Height', 'Weight',
  'Kind', 'Pokedex', 'Rareness', 'Evolutions', 'FormNames',
]);
const speciesByInternal = new Map(Object.entries(pbsSpecies).map(([id, p]) => [p.InternalName, Number(id)]));

const species = {};
for (let id = 1; id <= speciesCount; id++) {
  const base = RECORD * (id - 1);
  const b = (o) => dex[base + o];
  const p = pbsSpecies[id] || {};
  const lm = [];
  if (p.Moves) {
    const parts = p.Moves.split(',');
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const lvl = Number(parts[i]);
      const mid = moveByName.get(parts[i + 1].trim());
      if (Number.isFinite(lvl) && mid) lm.push([lvl, mid]);
    }
  }
  const ab = (p.Abilities || '').split(',').map((n) => abilityByName.get(n.trim())).filter(Boolean);
  const ha = p.HiddenAbility ? abilityByName.get(p.HiddenAbility.trim()) || 0 : 0;
  const em = (p.EggMoves || '').split(',').map((n) => moveByName.get(n.trim())).filter(Boolean);
  const cp = (p.Compatibility || '').split(',').map((s) => s.trim()).filter(Boolean);
  const fn = p.FormNames ? p.FormNames.split(',').map((s) => s.trim()) : [];

  const evo = [];
  if (p.Evolutions) {
    const parts = p.Evolutions.split(',');
    for (let i = 0; i + 2 < parts.length; i += 3) {
      const targetId = speciesByInternal.get(parts[i]?.trim());
      const method = parts[i + 1]?.trim();
      const param = parts[i + 2]?.trim();
      if (targetId) evo.push([targetId, method, param]);
    }
  }

  species[id] = {
    n: p.Name || `SPECIES${id}`,
    i: p.InternalName || '',
    bs: [0, 1, 2, 3, 4, 5].map((k) => b(OFF.baseStats + k)),
    gn: b(OFF.genderRate),
    hp: b(OFF.happiness),
    gr: b(OFF.growthRate),
    xp: b(OFF.baseExp) | (b(OFF.baseExp + 1) << 8),
    lm,
    ab,
    ha,
    t1: typeByInternal.get(p.Type1) || 0,
    t2: p.Type2 ? (typeByInternal.get(p.Type2) || 0) : 0,
    ep: (p.EffortPoints || '').split(',').map((n) => Number(n) || 0),
    cp,
    em,
    hs: Number(p.StepsToHatch) || 0,
    ht: Number(p.Height) || 0,
    wt: Number(p.Weight) || 0,
    kd: p.Kind || '',
    dx: p.Pokedex || '',
    rn: Number(p.Rareness) || 0,
    evo,
    fn,
  };
}

const bundle = {
  generatedAt: new Date().toISOString().slice(0, 10),
  gameTitle: (text('Game.ini') || '').match(/^Title=(.*)$/m)?.[1]?.trim() || 'Pokemon Z',
  speciesCount,
  variables: namesFrom('@variables'),
  switches: namesFrom('@switches'),
  maps,
  species,
  items,
  moves,
  abilities,
  trainerTypes,
  types,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bundle));
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`wrote data/gamedata.json  (${kb(readFileSync(OUT).length)})`);
console.log(`  ${Object.keys(bundle.variables).length} variable names, ${Object.keys(bundle.switches).length} switch names`);
console.log(`  ${speciesCount} species, ${Object.keys(items).length} items, ${Object.keys(moves).length} moves, ${Object.keys(maps).length} maps, ${Object.keys(types).length} types`);
