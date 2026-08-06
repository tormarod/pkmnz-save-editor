// Repairs a save written by an older build of this editor, which wrote integers
// above the 31-bit Fixnum ceiling as Marshal 'i' instead of promoting them to a
// Bignum. RGSS reads such a value with a raw INT2FIX, wrapping it to a negative
// number — which crashed the trainer notes screen with "time must be positive"
// on any injected Pokemon (@timeReceived is a unix timestamp, ~1.79e9).
//
//   node tools/repair.js                       # check, report only
//   node tools/repair.js --write               # fix, keeping a .bak
//   PKMNZ_SAVE_DIR="D:/saves" node tools/repair.js

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Save } from '../src/save.js';
import { dumpAll, FIXNUM_MAX, FIXNUM_MIN } from '../src/marshal.js';

const SAVE_DIR = process.env.PKMNZ_SAVE_DIR || join(homedir(), 'Saved Games', 'Pokemon Z');
const write = process.argv.includes('--write');

if (!existsSync(SAVE_DIR)) {
  console.error(`no such folder: ${SAVE_DIR}\nset PKMNZ_SAVE_DIR to your save folder`);
  process.exit(2);
}

/** Walk the whole graph and report integers that cannot be Fixnums. */
function findOversized(root) {
  const seen = new Set();
  const hits = [];
  const walk = (v, path) => {
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (v > FIXNUM_MAX || v < FIXNUM_MIN) hits.push({ path, value: v });
      return;
    }
    if (typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v.t === 'array') v.items.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v.t === 'hash') v.entries.forEach(([k, val], i) => { walk(k, `${path}{${i}}k`); walk(val, `${path}{${i}}`); });
    else if (v.t === 'obj' || v.t === 'struct') v.ivars.forEach(([k, val]) => walk(val, `${path}.${k}`));
    else if (v.t === 'usrmarshal') walk(v.value, `${path}.value`);
  };
  root.forEach((s, i) => walk(s, `stream${i}`));
  return hits;
}

let repaired = 0;
const files = readdirSync(SAVE_DIR).filter((n) => n.toLowerCase().endsWith('.rxdata')).sort();
if (!files.length) console.log(`no .rxdata files in ${SAVE_DIR}`);

for (const file of files) {
  const path = join(SAVE_DIR, file);
  const before = new Uint8Array(readFileSync(path));
  let save;
  try { save = new Save(file, before); } catch (e) { console.log(`${file}: cannot read — ${e.message}`); continue; }

  const after = dumpAll(save.streams);
  const same = Buffer.compare(Buffer.from(before), Buffer.from(after)) === 0;
  const hits = findOversized(save.streams);

  if (same && !hits.length) { console.log(`${file}: ok`); continue; }

  console.log(`${file}: ${hits.length} oversized integer(s) stored as Fixnum`);
  for (const h of hits.slice(0, 12)) {
    console.log(`    ${h.path} = ${h.value}`
      + (/time/i.test(h.path) ? `  (${new Date(h.value * 1000).toISOString()})` : ''));
  }
  if (hits.length > 12) console.log(`    …and ${hits.length - 12} more`);

  if (!write) { console.log('    run again with --write to fix'); continue; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  copyFileSync(path, `${path}.${stamp}.bak`);
  writeFileSync(path, save.serialize());
  repaired++;
  console.log(`    rewritten: ${before.length} -> ${after.length} bytes, .bak kept`);
}

console.log(write ? `\n${repaired} file(s) repaired` : '\nnothing was written (pass --write to apply)');
