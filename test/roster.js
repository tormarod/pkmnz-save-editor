// Round 2 of bulk actions: rare candy, EVs, happiness, PP Ups, and giving a
// full item set - exercised through the same /api/* routes the UI calls.

import { call, openBytes } from '../src/localApi.js';
import { dumpAll } from '../src/marshal.js';
import { itemsInPocket } from '../src/gamedata.js';
import { loadBundle, readSave, listSaves, makeChecker } from './helpers.js';

loadBundle();
const check = makeChecker();

console.log('\nsecond round of bulk actions\n');

const file = listSaves()[0];
if (!file) { console.log('\nno saves found; skipping the bulk-action checks'); check.finish(); }

const save = readSave(file);
openBytes(file, dumpAll(save.streams));

// Add a fresh, known Pokemon to the party so every check below has a
// predictable starting point regardless of what the save already contains.
await call('/api/pokemon/add', {
  species: 887, level: 50, target: 'party', nature: 0,
  iv: [31, 31, 31, 31, 31, 31], ev: [0, 0, 0, 0, 0, 0], moves: [1, 2],
});
const party = (await call('/api/party')).party;
const mon = party[party.length - 1];

// --- rare candy: the whole party jumps to one level --------------------------
const rc = await call('/api/party/rareCandy', { level: 77 });
check('rareCandy reports the clamped level', rc.level === 77, String(rc.level));
check('rareCandy touched every party Pokemon', rc.count === party.length, `${rc.count} vs ${party.length}`);
const afterCandy = (await call('/api/party')).party[party.length - 1];
check('the new Pokemon is now level 77', afterCandy.level === 77, String(afterCandy.level));

const rcClamp = await call('/api/party/rareCandy', { level: 9001 });
check('rareCandy clamps above the level cap', rcClamp.level === 100, String(rcClamp.level));
const afterClamp = (await call('/api/party')).party[party.length - 1];
check('the level actually clamped to 100', afterClamp.level === 100, String(afterClamp.level));

// --- EVs: max, clear, and a 252/252/6 preset spread ---------------------------
const atkBefore = afterClamp.statValues.find((s) => s.name === 'Atk').value;
await call('/api/pokemon/setEVs', { path: mon.path, evs: [252, 252, 252, 252, 252, 252] });
const maxed = (await call('/api/party')).party[party.length - 1];
check('maxing EVs raises Attack', maxed.statValues.find((s) => s.name === 'Atk').value > atkBefore);
check('maxing EVs writes 252 to every slot',
  maxed.stats.find((s) => s.ivar === '@ev').values.every((v) => v.value === 252));

await call('/api/pokemon/setEVs', { path: mon.path, evs: [0, 0, 0, 0, 0, 0] });
const cleared = (await call('/api/party')).party[party.length - 1];
check('clearing EVs restores the pre-EV Attack', cleared.statValues.find((s) => s.name === 'Atk').value === atkBefore);

await call('/api/pokemon/setEVs', { path: mon.path, evs: [0, 252, 0, 0, 0, 6].map((v, i) => (i === 1 ? 252 : i === 5 ? 6 : 0)) });
const spread = (await call('/api/party')).party[party.length - 1];
const evVals = spread.stats.find((s) => s.ivar === '@ev').values.map((v) => v.value);
check('the 252/252/6 spread lands on the right slots', evVals.join() === '0,252,0,0,0,6', evVals.join());

// --- max happiness -------------------------------------------------------------
await call('/api/pokemon/maxHappiness', { path: mon.path });
const happy = (await call('/api/party')).party[party.length - 1];
check('happiness is maxed to 255', happy.fields.find((f) => f.ivar === '@happiness').value === 255);

// --- max PP Ups: every move's PP Ups hit the cap, and PP refills to match ------
await call('/api/pokemon/maxPPUps', { path: mon.path });
const ppMaxed = (await call('/api/party')).party[party.length - 1];
check('every move has 3 PP Ups', ppMaxed.moves.every((m) => m.ppup === 3), JSON.stringify(ppMaxed.moves.map((m) => m.ppup)));
check('PP was refilled to match the new max', ppMaxed.moves.every((m) => m.pp > 0));

// --- give a set: one of every item PBS declares for a pocket -------------------
const POKEBALL_POCKET = 3;
const expectedBalls = itemsInPocket(POKEBALL_POCKET);
const before = (await call('/api/bag')).pockets.find((p) => p.pocket === POKEBALL_POCKET).items.length;
const given = await call('/api/bag/giveSet', { pocket: POKEBALL_POCKET, qty: 1 });
check('giveSet adds one of every declared Poke Ball item', given.count === expectedBalls.length, `${given.count} vs ${expectedBalls.length}`);
const after = (await call('/api/bag')).pockets.find((p) => p.pocket === POKEBALL_POCKET).items;
check('every declared ball id is now present', expectedBalls.every((id) => after.some((it) => it.id === id)));
check('a second call stacks rather than duplicating rows',
  (await call('/api/bag/giveSet', { pocket: POKEBALL_POCKET, qty: 1 })).count === expectedBalls.length
  && (await call('/api/bag')).pockets.find((p) => p.pocket === POKEBALL_POCKET).items.length === before + expectedBalls.length,
  `rows: ${before} -> ${(await call('/api/bag')).pockets.find((p) => p.pocket === POKEBALL_POCKET).items.length}`);

check.finish();
