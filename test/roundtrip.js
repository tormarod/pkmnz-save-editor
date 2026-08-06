// Byte-identical round-trip check: read every .rxdata we can find, dump it back
// out, and require the bytes to match exactly. If this passes, the codec is not
// silently reshaping anything when the editor rewrites a save.
//
// Always runs against the committed fixture in test/fixtures/; also checks a
// real game install / save folder when PKMNZ_GAME_DIR / PKMNZ_SAVE_DIR point
// at one, for extra coverage on a maintainer's machine.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadAll, dumpAll } from '../src/marshal.js';
import { GAME_DIR, SAVE_DIR, FIXTURE_DIR } from './helpers.js';

function collect() {
  const files = [];
  for (const dir of [SAVE_DIR, join(GAME_DIR, 'Data'), FIXTURE_DIR]) {
    let names;
    try { names = readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!n.toLowerCase().endsWith('.rxdata')) continue;
      const p = join(dir, n);
      if (statSync(p).isFile()) files.push(p);
    }
  }
  return files;
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

const files = collect();
if (!files.length) {
  // Should be unreachable: FIXTURE_DIR is committed. Only hit if it's missing.
  console.log(`no .rxdata found in ${SAVE_DIR}, ${GAME_DIR}/Data, or the fixture dir`);
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures = [];
const verbose = process.argv.includes('-v');

for (const path of files) {
  const label = `${basename(path)}`.padEnd(26);
  const buf = new Uint8Array(readFileSync(path));
  try {
    const streams = loadAll(buf);
    const out = dumpAll(streams.map((s) => s.value));
    const d = firstDiff(buf, out);
    if (d === -1) {
      pass++;
      if (verbose) console.log(`  ok   ${label} ${streams.length} stream(s), ${buf.length} bytes`);
    } else {
      fail++;
      failures.push(path);
      console.log(`  FAIL ${label} differs at byte ${d} (in ${buf.length} -> out ${out.length})`);
    }
  } catch (e) {
    fail++;
    failures.push(path);
    console.log(`  FAIL ${label} ${e.message}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('failing files:');
  for (const f of failures) console.log(`  ${f}`);
  console.log('\nA save written by an older build may hold an oversized Fixnum;');
  console.log('check it with: node tools/repair.js');
  process.exit(1);
}
