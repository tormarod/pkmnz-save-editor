// End-to-end edit check, entirely in memory: load a real save, change a few
// fields through the same code path the UI uses, re-serialize, and prove that
// (a) the values really changed, and (b) nothing else in the file moved.

import { loadAll, dumpAll, strToJs } from '../src/marshal.js';
import * as views from '../src/views.js';
import { loadBundle, readSave, saveBytes, listSaves, makeChecker } from './helpers.js';

loadBundle();

const FILE = process.argv[2] || listSaves()[0];
if (!FILE) { console.log('no saves found; set PKMNZ_SAVE_DIR'); process.exit(0); }

const save = readSave(FILE);
const before = saveBytes(FILE);
const check = makeChecker();

console.log(`\nediting ${FILE} in memory\n`);

// 1. baseline: an untouched Save must re-dump byte-identically
check('untouched save re-dumps identically',
  Buffer.compare(Buffer.from(dumpAll(save.streams)), Buffer.from(before)) === 0);

// 2. variable 99 (the save slot) via the same path the Variables tab uses
const varRow = views.variables(save).find((r) => r.index === 99);
check('variable 99 is named "NO TOCAR"', varRow?.name === 'NO TOCAR', `got ${varRow?.name}`);
const originalSlot = varRow.value;
save.set(varRow.path, 7);
check('variable 99 now reads 7', views.slotOf(save) === 7, `got ${views.slotOf(save)}`);
check('slot 7 maps to Game_7.rxdata', views.expectedFile(7) === 'Game_7.rxdata');

// 3. a string field
const tr = views.trainer(save);
const nameField = tr.fields.find((f) => f.ivar === '@name');
save.set(nameField.path, 'ÑandúTest');
const reread = views.summary(save);
check('trainer name round-trips through UTF-8', reread.trainerName === 'ÑandúTest', `got ${reread.trainerName}`);

// 4. a boolean field
save.set(tr.badges[0].path, true);
check('badge 1 is set', views.summary(save).badges === 1);

// 5. type safety: a Fixnum field must reject a non-integer
let rejected = false;
try { save.set(varRow.path, 'twelve'); } catch { rejected = true; }
check('a Fixnum field rejects non-numeric input', rejected);
let rejectedFloat = false;
try { save.set(varRow.path, 1.5); } catch { rejectedFloat = true; }
check('a Fixnum field rejects a fractional value', rejectedFloat);

// 6. the edited save must still be a valid 15-stream file
const out = dumpAll(save.streams);
const restreams = loadAll(out);
check('edited save still has 15 streams', restreams.length === 15, `got ${restreams.length}`);
const reloaded = loadAll(out).map((s) => s.value);
const vdata = reloaded[6].ivars.find(([k]) => k === '@data')[1];
check('variable 99 survives a save/load cycle', vdata.items[99] === 7, `got ${vdata.items[99]}`);
const rname = reloaded[0].ivars.find(([k]) => k === '@name')[1];
check('trainer name survives a save/load cycle', strToJs(rname) === 'ÑandúTest', `got ${strToJs(rname)}`);

// 7. put everything back and confirm we land exactly on the original bytes
save.set(varRow.path, originalSlot);
save.set(nameField.path, tr.fields.find((f) => f.ivar === '@name').value);
save.set(tr.badges[0].path, false);
const restored = dumpAll(save.streams);
check('reverting every edit reproduces the original file byte for byte',
  Buffer.compare(Buffer.from(restored), Buffer.from(before)) === 0,
  `${restored.length} vs ${before.length} bytes`);

check.finish();
