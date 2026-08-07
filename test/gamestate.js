// The Game state tab's data layer: one list for both sections, annotations
// coming through from the bundle, and - the subtle one - ids the save's arrays
// are too short to contain.
//
// Game_Switches#@data only runs as far as the highest id the game has written,
// so a mid-story save has no slot at all for switch 502, the sixth badge. The
// tab has to offer it anyway, and writing it has to extend the array with nil
// the way Ruby's `@data[502] = true` does - a JS hole would break the Marshal
// writer.

import { gameState } from '../src/views.js';
import { entryOf, tagsOf } from '../src/labels.js';
import { getIvar as ivar, loadAll } from '../src/marshal.js';
import { SECTIONS } from '../src/schema.js';
import {
  loadBundle, listSaves, readSave, makeChecker,
} from './helpers.js';

loadBundle();
const check = makeChecker();

const files = listSaves();
if (!files.length) { console.log('\nno save to test against\n'); process.exit(0); }
const save = readSave(files[0]);
console.log(`\ngame state view over ${files[0]}\n`);

const rows = gameState(save);
const sw = (id) => rows.find((r) => r.kind === 'switch' && r.index === id);
const vr = (id) => rows.find((r) => r.kind === 'variable' && r.index === id);

// --- one list, both kinds ----------------------------------------------------
check('both sections come back in one list',
  rows.some((r) => r.kind === 'switch') && rows.some((r) => r.kind === 'variable'));
check('every row carries a group', rows.every((r) => typeof r.group === 'string' && r.group));
check('every row keeps its Marshal path', rows.every((r) => Array.isArray(r.path) && r.path.length === 3));

// --- annotations reach the rows ----------------------------------------------
const shiny = sw(457);
check('switch 457 is described, not just named',
  shiny?.es?.n === 'Poción Brillante activa', shiny?.es?.n);
check('the dev name is kept alongside the new label',
  shiny?.name === 'Cartel Torre Oscura', shiny?.name);
check('switch 662 is tagged inverted', tagsOf('switches', 662).includes('inverted'));
check('switch 759 is tagged wide', tagsOf('switches', 759).includes('wide'));
check('switch 151 is tagged dead', tagsOf('switches', 151).includes('dead'));
check('switch 457 is tagged script', tagsOf('switches', 457).includes('script'));
check('switch 35 is tagged reserved', tagsOf('switches', 35).includes('reserved'));
check('the badge group is populated',
  rows.filter((r) => r.group === 'badges').length >= 12,
  String(rows.filter((r) => r.group === 'badges').length));
check('all eighteen amulets are grouped together',
  rows.filter((r) => r.group === 'amulets').length === 18,
  String(rows.filter((r) => r.group === 'amulets').length));

// --- ids past the end of the save's arrays -----------------------------------
const swData = ivar(save.section('switches'), '@data');
const len = swData.items.length;
const beyond = 502; // SWITCHGYM6, the sixth badge
check('the fixture is genuinely shorter than the ids we care about', len <= beyond,
  `@data length ${len}`);
check(`switch ${beyond} is offered even though the save has no slot for it`, !!sw(beyond));
check(`switch ${beyond} reads as off`, sw(beyond)?.value === false);
check(`switch ${beyond} is flagged absent`, sw(beyond)?.absent === true);
check('an absent id still knows its group', sw(beyond)?.group === 'badges');

// --- writing past the end ----------------------------------------------------
save.set(sw(beyond).path, true);
const after = ivar(save.section('switches'), '@data').items;
let holes = 0;
for (let i = 0; i < after.length; i++) if (!(i in after)) holes += 1;
check('the array grew to fit', after.length === beyond + 1, `${len} -> ${after.length}`);
check('the gap is filled with nil, not JS holes', holes === 0, `${holes} holes`);
check('the padding is null', after[len] === null && after[beyond - 1] === null);
check('the written value landed', after[beyond] === true);

const bytes = save.serialize();
const reread = loadAll(bytes);
check('the edited save still parses into every stream',
  reread.length === SECTIONS.length, `${reread.length} streams`);
const swIdx = SECTIONS.findIndex((s) => s.key === 'switches');
check('the value survives a round-trip',
  ivar(reread[swIdx].value, '@data').items[beyond] === true);

// --- variables ---------------------------------------------------------------
const nests = vr(70);
check('variable 70 carries its counter description',
  /18/.test(nests?.es?.d || ''), nests?.es?.n);
check('a variable row is a variable, not a switch', nests?.kind === 'variable');

// --- the bundle's group vocabulary -------------------------------------------
check('switch 502 is annotated in the bundle', !!entryOf('switches', 502).es);
check('every group used by a row exists in the bundle',
  rows.every((r) => !!entryOf(r.kind === 'switch' ? 'switches' : 'variables', r.index)));

check.finish();
