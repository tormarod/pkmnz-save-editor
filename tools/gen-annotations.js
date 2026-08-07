// Fills in the ~820 story flags that are not worth describing by hand.
//
//   node tools/gen-annotations.js "C:/path/to/Pokemon Z"
//
// Rewrites data/annotations.json in place, adding one entry per named switch and
// variable that has no hand-written entry. Generated entries carry "gen": true
// and are the only ones this script will ever touch - a hand-written entry is
// copied through unchanged, so regenerating never costs curated work.
//
// The group comes from the id's dominant map (the map with the most references
// to it) through the chapter table in tools/chapters.js. The description just
// states what the cross-reference found, because that is all we honestly know
// about a flag nobody has read.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildXref } from './xref.js';
import { chapterOf } from './chapters.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', 'data', 'annotations.json');

const RESERVED_RE = /^-+\s*RESERVED\s*-+$/i;

/** "1 evento" / "5 eventos" */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The description for a story flag: where it lives and how much of the game
 * touches it. Deliberately dry - inventing a plot summary from a map name would
 * be a guess, and these rows already show the map.
 */
function describe(kind, rec, mapName) {
  const isSwitch = kind === 'switches';
  const subject = isSwitch ? 'Lo' : 'La';
  const noun = isSwitch ? 'Marca de historia' : 'Estado de historia';

  if (!rec || (!rec.writesCount && !rec.readsCount && !rec.gatesCount)) {
    return `No encontramos ningún evento ni script que ${isSwitch ? 'lo' : 'la'} lea. `
      + 'Puede que el juego llegue a usarlo por una vía que no sabemos seguir, '
      + 'así que editarlo probablemente no haga nada.';
  }

  const where = mapName ? `${noun} de ${mapName.name} (mapa ${mapName.id}). ` : `${noun}. `;

  const parts = [];
  if (rec.writesCount) {
    // The verb agrees with the number of events, not with the flag.
    const verb = isSwitch
      ? (rec.writesCount === 1 ? 'activa' : 'activan')
      : (rec.writesCount === 1 ? 'escribe' : 'escriben');
    parts.push(`${subject.toLowerCase()} ${verb} ${plural(rec.writesCount, 'evento', 'eventos')}`);
  }
  if (rec.gatesCount) parts.push(`condiciona ${plural(rec.gatesCount, 'página de evento', 'páginas de evento')}`);
  if (rec.readsCount) parts.push(`se consulta ${plural(rec.readsCount, 'vez', 'veces')}`);

  // "a, b y c" - comma-separated with a single "y" before the last clause.
  let sentence = parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
    : parts[0];
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);

  const spread = rec.mapCount > 1
    ? `, repartid${isSwitch ? 'o' : 'a'} por ${plural(rec.mapCount, 'mapa', 'mapas')}`
    : '';
  return `${where}${sentence}${spread}.`;
}

function generate(gameDir) {
  const xref = buildXref(gameDir);
  const current = JSON.parse(readFileSync(FILE, 'utf8'));
  const out = { _readme: current._readme };

  let kept = 0;
  let made = 0;

  for (const kind of ['switches', 'variables']) {
    const names = kind === 'switches' ? xref.switchNames : xref.variableNames;
    const table = xref[kind];
    const curated = {};
    const generated = {};

    // Named ids, plus any id someone described by hand. A few hand-written
    // entries cover ids with no name in the RPG Maker editor at all - the
    // Shinylocke switches are only ever referred to by a script constant - and
    // dropping them here would quietly delete curated work.
    const ids = new Set([...Object.keys(names), ...Object.keys(current[kind] || {})]);

    for (const id of ids) {
      const existing = current[kind]?.[id];
      // A hand-written entry is copied through byte-for-byte.
      if (existing && !existing.gen) { curated[id] = existing; kept += 1; continue; }

      const name = names[id] || '';
      const rec = table[id];
      const dominant = rec?.dominantMap ?? null;
      const mapName = dominant ? { id: dominant, name: xref.mapNames[dominant] || `mapa ${dominant}` } : null;

      // Placeholders never get a chapter - they are not part of any story.
      const g = RESERVED_RE.test(name) ? 'none' : (chapterOf(dominant) ?? 'none');

      generated[id] = { g, gen: true, es: { d: describe(kind, rec, mapName) } };
      made += 1;
    }

    // Curated first, then generated, each in id order: keeps the hand-written
    // part of the file contiguous and reviewable.
    const byId = (o) => Object.fromEntries(Object.keys(o).map(Number).sort((a, b) => a - b).map((n) => [n, o[n]]));
    out[kind] = { ...byId(curated), ...byId(generated) };
  }

  writeFileSync(FILE, `${JSON.stringify(out, null, 2)}\n`);
  return { kept, made };
}

const gameDir = process.argv[2] || process.env.PKMNZ_GAME_DIR;
if (!gameDir) {
  console.error('usage: node tools/gen-annotations.js "<path to the Pokemon Z folder>"');
  process.exit(2);
}
const { kept, made } = generate(gameDir);
console.log(`data/annotations.json: ${kept} hand-written entries kept, ${made} generated`);
