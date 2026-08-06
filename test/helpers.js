// Node-side glue for the tests: loads the baked bundle into src/data.js and
// reads save files off disk. The browser build never does either of these.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { setData } from '../src/data.js';
import { Save } from '../src/save.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');

/** The game install, only needed by tests that read the original .rxdata files. */
export const GAME_DIR = process.env.PKMNZ_GAME_DIR
  || 'C:/Users/torma/Documents/LostieLauncher/Pokémon Z';

export const SAVE_DIR = process.env.PKMNZ_SAVE_DIR
  || join(homedir(), 'Saved Games', 'Pokemon Z');

export function loadBundle() {
  const p = join(ROOT, 'data', 'gamedata.json');
  if (!existsSync(p)) {
    throw new Error(`data/gamedata.json is missing — run: node tools/build-data.js "<game folder>"`);
  }
  return setData(JSON.parse(readFileSync(p, 'utf8')));
}

export function haveGame() {
  return existsSync(join(GAME_DIR, 'Data', 'System.rxdata'));
}

export function listSaves() {
  if (!existsSync(SAVE_DIR)) return [];
  return readdirSync(SAVE_DIR).filter((n) => n.toLowerCase().endsWith('.rxdata')).sort();
}

export function readSave(file) {
  return new Save(file, new Uint8Array(readFileSync(join(SAVE_DIR, file))));
}

export function saveBytes(file) {
  return new Uint8Array(readFileSync(join(SAVE_DIR, file)));
}

/** Tiny assertion helper shared by every test file. */
export function makeChecker() {
  const state = { failures: 0 };
  const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) state.failures++;
  };
  check.finish = (label = '') => {
    console.log(`\n${state.failures ? `${state.failures} check(s) failed` : 'all checks passed'}${label ? ` ${label}` : ''}\n`);
    process.exit(state.failures ? 1 : 0);
  };
  check.state = state;
  return check;
}
