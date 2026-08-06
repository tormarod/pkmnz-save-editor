// Regression test: a Pokemon's six stats are cached in the save and the game
// reads them straight back — calcStats only runs on level-up, evolution,
// vitamins and the like, never on load. So editing IVs or EVs without
// recomputing leaves the change invisible in game, which is exactly what
// happened with a 252 Atk / 252 SpD Dragapult whose stats stayed at their
// 0-EV values.

import { makePokemon, recalcStats, calcStats, calcHP, STAT_IVARS, STAT_INPUTS } from '../src/create.js';
import { speciesData } from '../src/gamedata.js';
import { loadBundle, makeChecker } from './helpers.js';
import { call, openBytes } from '../src/localApi.js';
import { dumpAll } from '../src/marshal.js';
import { readSave, listSaves } from './helpers.js';

loadBundle();
const check = makeChecker();

const g = (m, n) => m.ivars.find(([k]) => k === n)?.[1];
const stats = (m) => STAT_IVARS.map((k) => g(m, k));

console.log('\nrecalculating stats\n');

// --- EVs must move the numbers ----------------------------------------------
const base = { species: 887, level: 100, nature: 0, iv: [31, 31, 31, 31, 31, 31], speciesName: 'Dragapult' };
const noEv = makePokemon({ ...base, ev: [0, 0, 0, 0, 0, 0] });
const maxEv = makePokemon({ ...base, ev: [3, 252, 0, 0, 0, 252] });

check('creating with EVs already differs from 0 EVs',
  stats(noEv).join() !== stats(maxEv).join(), `${stats(noEv)} vs ${stats(maxEv)}`);

const sd = speciesData(887);
const expectedAtk = calcStats({ baseStats: sd.baseStats, level: 100, iv: base.iv, ev: [3, 252, 0, 0, 0, 252], nature: 0 })[1];
check('252 Atk EVs give the game-formula Attack', g(maxEv, '@attack') === expectedAtk, `${g(maxEv, '@attack')} vs ${expectedAtk}`);
check('252 EVs are worth +63 before nature',
  g(maxEv, '@attack') - g(noEv, '@attack') === 63, `+${g(maxEv, '@attack') - g(noEv, '@attack')}`);

// --- editing EVs after the fact, then recalculating ---------------------------
const mon = makePokemon({ ...base, ev: [0, 0, 0, 0, 0, 0] });
const beforeStats = stats(mon).join();
g(mon, '@ev').items[1] = 252;
g(mon, '@ev').items[5] = 252;
g(mon, '@ev').items[0] = 3;
check('writing @ev alone leaves the cached stats stale', stats(mon).join() === beforeStats);
recalcStats(mon);
check('recalcStats picks the EVs up', stats(mon).join() === stats(maxEv).join(), stats(mon).join());

// --- HP keeps its damage offset ----------------------------------------------
const hurt = makePokemon({ ...base, ev: [0, 0, 0, 0, 0, 0] });
const fullHp = g(hurt, '@totalhp');
const pair = hurt.ivars.find(([k]) => k === '@hp');
pair[1] = fullHp - 40;
g(hurt, '@ev').items[0] = 252;
recalcStats(hurt);
check('damage taken is preserved across a recalc',
  g(hurt, '@totalhp') - g(hurt, '@hp') === 40, `total=${g(hurt, '@totalhp')} hp=${g(hurt, '@hp')}`);
check('more HP EVs raise max HP', g(hurt, '@totalhp') > fullHp, `${fullHp} -> ${g(hurt, '@totalhp')}`);

// --- IVs and level also feed the stats ---------------------------------------
const lowIv = makePokemon({ ...base, iv: [0, 0, 0, 0, 0, 0], ev: [0, 0, 0, 0, 0, 0] });
check('IVs affect stats too', g(lowIv, '@attack') < g(noEv, '@attack'), `${g(lowIv, '@attack')} vs ${g(noEv, '@attack')}`);
check('@iv, @ev, @exp, @species and @natureflag are all watched',
  ['@iv', '@ev', '@exp', '@species', '@natureflag'].every((k) => STAT_INPUTS.includes(k)));

// --- through the API, the way the UI does it ---------------------------------
const file = listSaves()[0];
if (!file) {
  console.log('\n  (no saves found; skipping the API check)');
  check.finish();
}

const save = readSave(file);
openBytes(file, dumpAll(save.streams));
const partyBefore = (await call('/api/party')).party.length;
await call('/api/pokemon/add', { species: 887, level: 100, target: 'party', ev: [0, 0, 0, 0, 0, 0], iv: [31, 31, 31, 31, 31, 31], nature: 0 });
const party = (await call('/api/party')).party;
const idx = party.length - 1;
check('the API added a Pokemon', party.length === partyBefore + 1);

const evField = party[idx].stats.find((s) => s.ivar === '@ev');
const atkBefore = party[idx].statValues.find((s) => s.name === 'Atk').value;
const r = await call('/api/set', { path: evField.values[1].path, value: 252 });
check('/api/set reports that it recalculated', r.recalculated === true);

const after = (await call('/api/party')).party[idx];
const atkAfter = after.statValues.find((s) => s.name === 'Atk').value;
check('editing an EV through the API moves the stat',
  atkAfter === atkBefore + 63, `${atkBefore} -> ${atkAfter}`);

// editing something unrelated must NOT trigger a recalc
const happy = after.fields.find((f) => f.ivar === '@happiness');
const r2 = await call('/api/set', { path: happy.path, value: 200 });
check('editing happiness does not trigger a recalc', r2.recalculated === false);

check.finish();
