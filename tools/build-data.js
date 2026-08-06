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
//   PBS/*.txt             species / item / move / ability / trainer-type names,
//                         and level-up movesets

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

// --- species: names + level-up moves from PBS, numbers from dexdata.dat -------
const RECORD = 76;
const OFF = { baseStats: 10, genderRate: 18, happiness: 19, growthRate: 20, baseExp: 38 };
const dex = new Uint8Array(readFileSync(join(GAME_DIR, 'Data/dexdata.dat')));
const speciesCount = Math.floor(dex.length / RECORD);

const ptxt = text('PBS/pokemon.txt') || '';
const pbsSpecies = {};
let cur = null;
for (const line of ptxt.split(/\r?\n/)) {
  const sec = /^\[(\d+)\]/.exec(line);
  if (sec) { cur = Number(sec[1]); pbsSpecies[cur] = {}; continue; }
  if (cur === null) continue;
  const m = /^(Name|InternalName|Moves)\s*=\s*(.*)$/.exec(line);
  if (m) pbsSpecies[cur][m[1]] = m[2].trim();
}

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
  species[id] = {
    n: p.Name || `SPECIES${id}`,
    i: p.InternalName || '',
    bs: [0, 1, 2, 3, 4, 5].map((k) => b(OFF.baseStats + k)),
    gn: b(OFF.genderRate),
    hp: b(OFF.happiness),
    gr: b(OFF.growthRate),
    xp: b(OFF.baseExp) | (b(OFF.baseExp + 1) << 8),
    lm,
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
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bundle));
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`wrote data/gamedata.json  (${kb(readFileSync(OUT).length)})`);
console.log(`  ${Object.keys(bundle.variables).length} variable names, ${Object.keys(bundle.switches).length} switch names`);
console.log(`  ${speciesCount} species, ${Object.keys(items).length} items, ${Object.keys(moves).length} moves, ${Object.keys(maps).length} maps`);
