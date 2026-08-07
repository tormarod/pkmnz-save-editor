// Cross-references every RPG Maker switch and variable against the whole game:
// all Data/Map*.rxdata, Data/CommonEvents.rxdata and the zlib-packed
// Data/Scripts.rxdata. For each id it records who writes it, who reads it,
// which event pages it gates, what values it takes, and the dialogue sitting in
// the same page - the raw material for the hand-written descriptions in
// data/annotations.json.
//
//   node tools/xref.js "C:/path/to/Pokemon Z"      -> tools/_xref.json
//   PKMNZ_GAME_DIR="C:/path/to/Pokemon Z" node tools/xref.js
//
// _xref.json is a research artifact, not a build input: build-data.js calls
// buildXref() directly so the bundle only ever has one source of truth, the
// game folder itself.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll, strToJs, getIvar as ivar } from '../src/marshal.js';

// --- RPG Maker XP event command codes we can attribute to an id ---------------
//
// Only the codes whose parameter layout names a switch or variable outright are
// modelled. Anything that reaches an id through a computed index - a `pbSet`
// behind arithmetic, an event that writes a range it built at runtime - is
// invisible here, which is why "nothing reads this" is reported as an inference
// and never as a fact.
const CODE = {
  TEXT: 101, TEXT_MORE: 401, CHOICES: 102, INPUT_NUMBER: 103, BUTTON_INPUT: 105,
  COMMENT: 108, COMMENT_MORE: 408, BRANCH: 111,
  SWITCHES: 121, VARIABLES: 122,
  GOLD: 125, ITEMS: 126, WEAPONS: 127, ARMOR: 128,
  TRANSFER: 201, EVENT_LOCATION: 202,
  SHOW_PICTURE: 231, MOVE_PICTURE: 232,
  SCRIPT: 355, SCRIPT_MORE: 655,
};

// $game_switches[457], $game_variables[130], pbGet(70), pbSet(70,1) - and the
// same again with a constant in the brackets, which is how the engine refers to
// most of the ids it cares about (SHINY_WILD_POKEMON_SWITCH, SWITCHGYM6, ...).
// The bracket may hold a bare number, a constant, or a namespaced constant
// (`AdvancedPokedexScene::SWITCH`). Anything else - `$game_switches[poke[2]]`,
// an index the script computes - stays unresolved on purpose.
const IDENT = '[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*|\\d+';
const SWITCH_RE = new RegExp(`\\$game_switches\\s*\\[\\s*(${IDENT})\\s*\\]`, 'g');
const VARIABLE_RE = new RegExp(`\\$game_variables\\s*\\[\\s*(${IDENT})\\s*\\]`, 'g');
const PBGET_RE = new RegExp(`\\bpb(?:Get|Set)\\s*\\(\\s*(${IDENT})`, 'g');
// `NAME = 457` constant definitions, plus the `module`/`class` they sit in, so
// two modules that both define `SWITCH` stay distinguishable.
const CONST_RE = /^(\s*)([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*(?:#.*)?$/gm;
const SCOPE_RE = /^\s*(?:module|class)\s+([A-Z][A-Za-z0-9_]*)/;

const MAX_DIALOGUE = 8;      // snippets kept per id
const MAX_SNIPPET = 160;     // characters per snippet
const MAX_REFS = 400;        // detailed refs kept per id; counts stay exact

const str = (v) => (v && v.t === 'str' ? strToJs(v) : '');
const num = (v) => (typeof v === 'number' ? v : null);

/** Empty record for one switch or variable id. */
const blank = () => ({
  writes: [], reads: [], gates: [],
  writesCount: 0, readsCount: 0, gatesCount: 0,
  maps: {}, dominantMap: null,
  scriptRead: [], scriptWrite: [], constants: [],
  values: [], dialogue: [],
});

class Xref {
  constructor() {
    this.switches = new Map();
    this.variables = new Map();
    this.consts = new Map();   // "Module::NAME" and top-level "NAME" -> number
    this.bare = new Map();     // "NAME" -> number, or null once two modules disagree
  }

  defineConst(scope, name, value) {
    this.consts.set(scope ? `${scope}::${name}` : name, value);
    if (this.bare.has(name) && this.bare.get(name) !== value) this.bare.set(name, null);
    else this.bare.set(name, value);
  }

  /** A bracketed token as a number, or null when it cannot be pinned down. */
  resolve(token) {
    if (/^\d+$/.test(token)) return Number(token);
    if (this.consts.has(token)) return this.consts.get(token);
    const short = token.includes('::') ? token.slice(token.lastIndexOf('::') + 2) : token;
    return this.bare.get(short) ?? null;
  }

  rec(kind, id) {
    if (!Number.isInteger(id) || id < 1 || id > 5000) return null;
    const table = kind === 'switch' ? this.switches : this.variables;
    if (!table.has(id)) table.set(id, blank());
    return table.get(id);
  }

  // `where` is { m, mn, e, en, p } - map id/name, event id/name, page index.
  // Common events arrive as m: 0, which is not a real map and is kept out of
  // the per-map tallies.
  note(kind, id, bucket, where, extra) {
    const r = this.rec(kind, id);
    if (!r) return;
    r[`${bucket}Count`] += 1;
    if (r[bucket].length < MAX_REFS) r[bucket].push({ ...where, ...extra });
    if (where.m > 0) r.maps[where.m] = (r.maps[where.m] || 0) + 1;
  }

  value(kind, id, v) {
    const r = this.rec(kind, id);
    if (r && !r.values.includes(v)) r.values.push(v);
  }

  script(kind, id, file, mode, constant) {
    const r = this.rec(kind, id);
    if (!r) return;
    const list = mode === 'write' ? r.scriptWrite : r.scriptRead;
    if (!list.includes(file)) list.push(file);
    if (constant && !r.constants.includes(constant)) r.constants.push(constant);
  }

  dialogue(kind, id, lines) {
    const r = this.rec(kind, id);
    if (!r) return;
    for (const line of lines) {
      if (r.dialogue.length >= MAX_DIALOGUE) return;
      if (!r.dialogue.includes(line)) r.dialogue.push(line);
    }
  }
}

// --- one event page ----------------------------------------------------------

/** Show Text / Show Choices / Comment strings on a page, cleaned up. */
function pageDialogue(commands) {
  const out = [];
  for (const c of commands) {
    const code = num(ivar(c, '@code'));
    const params = ivar(c, '@parameters');
    if (!params || params.t !== 'array') continue;
    let raw = null;
    if (code === CODE.TEXT || code === CODE.TEXT_MORE) raw = str(params.items[0]);
    else if (code === CODE.COMMENT || code === CODE.COMMENT_MORE) raw = str(params.items[0]);
    else if (code === CODE.CHOICES && params.items[0]?.t === 'array') {
      raw = params.items[0].items.map(str).join(' / ');
    }
    if (!raw) continue;
    // Essentials control codes (\c[1], \pn, \v[3]) are noise in a description.
    const clean = raw.replace(/\\[a-zA-Z]+\[[^\]]*\]/g, '').replace(/\\[a-zA-Z]+/g, '').trim();
    if (clean.length > 2) out.push(clean.slice(0, MAX_SNIPPET));
  }
  return out;
}

/**
 * Walk one page's command list, attributing every switch/variable reference to
 * `where`. Returns the ids this page touches, so the page's dialogue can be
 * attached to them afterwards.
 */
function scanCommands(x, commands, where, scriptFile) {
  const touched = [];
  const mark = (kind, id) => { if (Number.isInteger(id)) touched.push([kind, id]); };

  for (const c of commands) {
    const code = num(ivar(c, '@code'));
    const pa = ivar(c, '@parameters');
    const p = pa && pa.t === 'array' ? pa.items : [];

    switch (code) {
      case CODE.SWITCHES: {
        // [start, end, 0 = ON | 1 = OFF]
        const [a, b, v] = [num(p[0]), num(p[1]), num(p[2])];
        if (a === null || b === null) break;
        for (let id = a; id <= b && id - a < 200; id++) {
          x.note('switch', id, 'writes', where, { v: v === 0 });
          x.value('switch', id, v === 0);
          mark('switch', id);
        }
        break;
      }
      case CODE.VARIABLES: {
        // [start, end, operation, operand_type, p4, p5, p6]
        const [a, b, op, kindOfOperand] = [num(p[0]), num(p[1]), num(p[2]), num(p[3])];
        if (a === null || b === null) break;
        let v;
        if (kindOfOperand === 0) v = num(p[4]);
        else if (kindOfOperand === 1) v = 'var';
        else if (kindOfOperand === 2) v = 'random';
        else v = 'computed';
        for (let id = a; id <= b && id - a < 200; id++) {
          x.note('variable', id, 'writes', where, { v, op });
          if (v !== undefined && v !== null) x.value('variable', id, v);
          mark('variable', id);
        }
        // Operand "variable N" is itself a read of N.
        if (kindOfOperand === 1 && num(p[4]) !== null) {
          x.note('variable', num(p[4]), 'reads', where, { k: 'operand' });
          mark('variable', num(p[4]));
        }
        break;
      }
      case CODE.INPUT_NUMBER:
      case CODE.BUTTON_INPUT:
        if (num(p[0]) !== null) {
          x.note('variable', num(p[0]), 'writes', where, { v: 'input' });
          x.value('variable', num(p[0]), 'input');
          mark('variable', num(p[0]));
        }
        break;
      case CODE.BRANCH: {
        const type = num(p[0]);
        if (type === 0 && num(p[1]) !== null) {
          x.note('switch', num(p[1]), 'reads', where, { k: 'branch', v: num(p[2]) === 0 });
          mark('switch', num(p[1]));
        } else if (type === 1 && num(p[1]) !== null) {
          // [1, var_id, operand_type, operand, comparison]
          x.note('variable', num(p[1]), 'reads', where, { k: 'branch', cmp: num(p[4]), v: num(p[3]) });
          mark('variable', num(p[1]));
          if (num(p[2]) === 1 && num(p[3]) !== null) {
            x.note('variable', num(p[3]), 'reads', where, { k: 'operand' });
            mark('variable', num(p[3]));
          }
        } else if (type === 12) {
          scanScriptText(x, str(p[1]), scriptFile, where, mark);
        }
        break;
      }
      case CODE.GOLD: case CODE.ITEMS: case CODE.WEAPONS: case CODE.ARMOR: {
        // Change Gold is [op, operand_type, operand]; the item ones prepend the
        // item id, so the operand pair sits one slot further along.
        const at = code === CODE.GOLD ? 1 : 2;
        if (num(p[at]) === 1 && num(p[at + 1]) !== null) {
          x.note('variable', num(p[at + 1]), 'reads', where, { k: 'operand' });
          mark('variable', num(p[at + 1]));
        }
        break;
      }
      case CODE.TRANSFER:
        // [appoint_type, map, x, y, ...] - appoint_type 1 makes 1..3 variable ids
        if (num(p[0]) === 1) {
          for (const i of [1, 2, 3]) {
            if (num(p[i]) !== null) { x.note('variable', num(p[i]), 'reads', where, { k: 'transfer' }); mark('variable', num(p[i])); }
          }
        }
        break;
      case CODE.EVENT_LOCATION:
        if (num(p[1]) === 1) {
          for (const i of [2, 3, 4]) {
            if (num(p[i]) !== null) { x.note('variable', num(p[i]), 'reads', where, { k: 'transfer' }); mark('variable', num(p[i])); }
          }
        }
        break;
      case CODE.SHOW_PICTURE: case CODE.MOVE_PICTURE: {
        // Show Picture puts the "coordinates come from variables" flag at 3,
        // Move Picture at 3 as well, with x/y in the two slots after it.
        const flagAt = code === CODE.SHOW_PICTURE ? 3 : 3;
        const xy = code === CODE.SHOW_PICTURE ? [4, 5] : [4, 5];
        if (num(p[flagAt]) === 1) {
          for (const i of xy) {
            if (num(p[i]) !== null) { x.note('variable', num(p[i]), 'reads', where, { k: 'picture' }); mark('variable', num(p[i])); }
          }
        }
        break;
      }
      case CODE.SCRIPT: case CODE.SCRIPT_MORE:
        scanScriptText(x, str(p[0]), scriptFile, where, mark);
        break;
      default:
        break;
    }
  }
  return touched;
}

/**
 * Find `$game_switches[...]`, `$game_variables[...]` and `pbGet/pbSet(...)` in a
 * chunk of Ruby. Used both for the script sections and for Script event
 * commands, which is where map events reach past the editor's own commands.
 */
function scanScriptText(x, code, scriptFile, where, mark) {
  if (!code) return;
  const hit = (re, kind) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      const token = m[1];
      const id = x.resolve(token);
      if (!Number.isInteger(id)) continue;
      // An assignment right after the bracket is a write, anything else a read.
      const after = code.slice(m.index + m[0].length, m.index + m[0].length + 4);
      const isWrite = /^\s*=[^=]/.test(after) || /pbSet/.test(m[0]);
      if (where) {
        x.note(kind, id, isWrite ? 'writes' : 'reads', where, { k: 'script' });
        if (mark) mark(kind, id);
      }
      if (scriptFile) x.script(kind, id, scriptFile, isWrite ? 'write' : 'read', /^\d+$/.test(token) ? null : token);
    }
  };
  hit(SWITCH_RE, 'switch');
  hit(VARIABLE_RE, 'variable');
  // pbGet/pbSet only ever address variables.
  hit(PBGET_RE, 'variable');
}

// --- the whole game ----------------------------------------------------------

/**
 * Read the game folder and return
 * `{ mapNames, switchNames, variableNames, switches, variables }`, the last two
 * being `{ id: record }` objects ready to be written out or merged into the
 * bundle.
 */
export function buildXref(gameDir) {
  const rx = (rel) => loadAll(new Uint8Array(readFileSync(join(gameDir, rel))))[0].value;
  const x = new Xref();

  // Names, so the report and the generated descriptions do not need a second
  // pass over System.rxdata.
  const sys = rx('Data/System.rxdata');
  const namesFrom = (which) => {
    const out = {};
    const arr = ivar(sys, which);
    if (arr?.t === 'array') arr.items.forEach((v, i) => { const s = str(v).trim(); if (s) out[i] = s; });
    return out;
  };
  const switchNames = namesFrom('@switches');
  const variableNames = namesFrom('@variables');

  const mapNames = {};
  const info = rx('Data/MapInfos.rxdata');
  if (info?.t === 'hash') {
    for (const [k, v] of info.entries) {
      const nm = ivar(v, '@name');
      if (typeof k === 'number' && nm?.t === 'str') mapNames[k] = strToJs(nm);
    }
  }

  // Pass 1: the script sections, which also give us the constant table every
  // later bracket lookup depends on.
  const scripts = rx('Data/Scripts.rxdata');
  const sources = [];
  scripts.items.forEach((entry, i) => {
    if (!entry || entry.t !== 'array') return;
    const name = str(entry.items[1]);
    const packed = entry.items[2];
    if (!packed || packed.t !== 'str') return;
    let code = '';
    try {
      code = new TextDecoder('utf-8', { fatal: false }).decode(inflateSync(Buffer.from(packed.bytes)));
    } catch { return; }
    sources.push({ file: `${String(i).padStart(3, '0')}_${name}.rb`, code });
  });

  // Constants first, whole-game: a script may use a constant another script
  // defines, so no single file can be resolved on its own.
  for (const { code } of sources) {
    const lines = code.split(/\r?\n/);
    // Indentation is the only scope marker worth tracking here - these scripts
    // never nest a module inside a module.
    let scope = null;
    for (const line of lines) {
      const open = SCOPE_RE.exec(line);
      if (open) { scope = open[1]; continue; }
      if (/^\s*end\s*$/.test(line) && !/^\s/.test(line)) { scope = null; continue; }
      CONST_RE.lastIndex = 0;
      const m = CONST_RE.exec(line);
      if (m) x.defineConst(m[1] ? scope : null, m[2], Number(m[3]));
    }
  }
  for (const { file, code } of sources) scanScriptText(x, code, file, null, null);

  // Pass 2: common events. They have no map, so they carry map id 0.
  const commons = rx('Data/CommonEvents.rxdata');
  if (commons?.t === 'array') {
    for (const ce of commons.items) {
      if (!ce || ce.t !== 'obj') continue;
      const id = num(ivar(ce, '@id'));
      const name = str(ivar(ce, '@name'));
      const list = ivar(ce, '@list');
      const where = { m: 0, e: id, en: name, p: 0 };
      // A common event with trigger != 0 is gated on its own switch.
      const trigger = num(ivar(ce, '@trigger'));
      const swId = num(ivar(ce, '@switch_id'));
      if (trigger !== 0 && swId) x.note('switch', swId, 'gates', where, { k: 'commonEvent' });
      if (list?.t !== 'array') continue;
      const touched = scanCommands(x, list.items, where, null);
      const lines = pageDialogue(list.items);
      for (const [kind, tid] of touched) x.dialogue(kind, tid, lines);
    }
  }

  // Pass 3: every map.
  const mapFiles = readdirSync(join(gameDir, 'Data'))
    .filter((f) => /^Map\d+\.rxdata$/i.test(f))
    .sort();
  for (const file of mapFiles) {
    const mapId = Number(/^Map(\d+)/i.exec(file)[1]);
    const mapName = mapNames[mapId] || '';
    const map = rx(join('Data', file));
    const events = ivar(map, '@events');
    if (events?.t !== 'hash') continue;
    for (const [, ev] of events.entries) {
      if (!ev || ev.t !== 'obj') continue;
      const eid = num(ivar(ev, '@id'));
      const ename = str(ivar(ev, '@name'));
      const pages = ivar(ev, '@pages');
      if (pages?.t !== 'array') continue;
      pages.items.forEach((page, pi) => {
        const where = { m: mapId, mn: mapName, e: eid, en: ename, p: pi };
        const cond = ivar(page, '@condition');
        if (cond) {
          // A page condition is the strongest kind of read: the switch decides
          // whether this version of the event exists at all.
          if (ivar(cond, '@switch1_valid') === true) x.note('switch', num(ivar(cond, '@switch1_id')), 'gates', where, { k: 'page' });
          if (ivar(cond, '@switch2_valid') === true) x.note('switch', num(ivar(cond, '@switch2_id')), 'gates', where, { k: 'page' });
          if (ivar(cond, '@variable_valid') === true) {
            x.note('variable', num(ivar(cond, '@variable_id')), 'gates', where, { k: 'page', v: num(ivar(cond, '@variable_value')) });
          }
        }
        const list = ivar(page, '@list');
        if (list?.t !== 'array') return;
        const touched = scanCommands(x, list.items, where, null);
        if (touched.length) {
          const lines = pageDialogue(list.items);
          for (const [kind, tid] of touched) x.dialogue(kind, tid, lines);
        }
      });
    }
  }

  // Every named id gets a record even when nothing references it - otherwise
  // the ids we most want to flag as dead are the ones with no row at all.
  for (const id of Object.keys(switchNames)) x.rec('switch', Number(id));
  for (const id of Object.keys(variableNames)) x.rec('variable', Number(id));

  const finish = (table) => {
    const out = {};
    for (const [id, r] of [...table].sort((a, b) => a[0] - b[0])) {
      const ranked = Object.entries(r.maps).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
      r.dominantMap = ranked.length ? Number(ranked[0][0]) : null;
      r.mapCount = ranked.length;
      r.refCount = r.writesCount + r.readsCount + r.gatesCount;
      // "Dead" is an inference, not a fact: it means nothing we can model - no
      // event command, no page condition, no script line with a resolvable
      // index - names this id. A pbSet behind a computed index is invisible.
      r.dead = r.refCount === 0 && !r.scriptRead.length && !r.scriptWrite.length;
      out[id] = r;
    }
    return out;
  };

  return {
    mapNames,
    switchNames,
    variableNames,
    constants: Object.fromEntries([...x.consts].sort()),
    constantCount: x.consts.size,
    switches: finish(x.switches),
    variables: finish(x.variables),
  };
}

// --- CLI ---------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gameDir = process.argv[2] || process.env.PKMNZ_GAME_DIR;
  if (!gameDir) {
    console.error('usage: node tools/xref.js "<path to the Pokemon Z folder>"');
    process.exit(2);
  }
  const xref = buildXref(gameDir);
  const out = join(HERE, '_xref.json');
  writeFileSync(out, JSON.stringify(xref, null, 1));

  const named = (n) => Object.keys(n).length;
  const dead = (names, table) =>
    Object.keys(names).filter((id) => !table[id] || table[id].dead).length;
  const sw759 = xref.switches[759];
  console.log(`wrote ${out}`);
  console.log(`named: ${named(xref.switchNames)} switches, ${named(xref.variableNames)} variables`);
  console.log(`no reference found: ${dead(xref.switchNames, xref.switches)} switches, `
    + `${dead(xref.variableNames, xref.variables)} variables`);
  console.log(`resolved ${xref.constantCount} script constants`);
  console.log(`switch 759 "${xref.switchNames[759]}": ${sw759?.refCount ?? 0} refs across ${sw759?.mapCount ?? 0} maps`);
}
