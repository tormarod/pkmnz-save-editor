// Builds Pokemon in memory, injects them into a real save, and checks that the
// result is structurally sound and survives a Marshal round trip.
import { makePokemon, calcHP, calcStat, describe } from '../src/create.js';
import { addToParty, addToBox, removeFromParty, removeFromBox, boxToParty, PARTY_MAX, BOX_SIZE } from '../src/roster.js';
import { speciesData, moveData } from '../src/gamedata.js';
import { startExperience, levelFromExperience } from '../src/expTable.js';
import { loadAll, dumpAll, strToJs } from '../src/marshal.js';
import * as views from '../src/views.js';
import { loadBundle, readSave, listSaves, makeChecker } from './helpers.js';

loadBundle();
const check = makeChecker();
const ivar = (o, n) => o.ivars.find(([k]) => k === n)?.[1];

console.log('\nbuilding Pokemon\n');

// --- a known-good hand calculation ------------------------------------------
// Bulbasaur: base 50,49,49,45,65,65. Level 50, all IVs 31, no EVs, neutral nature.
const bulba = makePokemon({
  species: 1, level: 50, speciesName: 'Bulbasaur',
  iv: [31, 31, 31, 31, 31, 31], ev: [0, 0, 0, 0, 0, 0], nature: 0, // 0/5==0%5 -> neutral
});
const expectedHP = calcHP(50, 50, 31, 0);
check('HP matches the game formula', ivar(bulba, '@totalhp') === expectedHP, `${ivar(bulba, '@totalhp')} vs ${expectedHP}`);
// floor((50*2 + 31 + 0) * 50 / 100) + 50 + 10 = 65 + 60 = 125
check('HP is 125 for this build', ivar(bulba, '@totalhp') === 125, String(ivar(bulba, '@totalhp')));
check('Attack matches the game formula', ivar(bulba, '@attack') === calcStat(49, 50, 31, 0, 100), String(ivar(bulba, '@attack')));
check('a fresh Pokemon is at full HP', ivar(bulba, '@hp') === ivar(bulba, '@totalhp'));
check('exp corresponds to level 50', ivar(bulba, '@exp') === startExperience(50, speciesData(1).growthRate));
check('level derives back to 50', levelFromExperience(ivar(bulba, '@exp'), speciesData(1).growthRate) === 50);

// nature multipliers: nature 1 -> nd5=0 (Atk +10%), nm5=1 (Def -10%)
const adamant = makePokemon({ species: 1, level: 50, iv: [31, 31, 31, 31, 31, 31], nature: 1, speciesName: 'Bulbasaur' });
check('a boosting nature raises the right stat',
  ivar(adamant, '@attack') === calcStat(49, 50, 31, 0, 110), String(ivar(adamant, '@attack')));
check('a hindering nature lowers the right stat',
  ivar(adamant, '@defense') === calcStat(49, 50, 31, 0, 90), String(ivar(adamant, '@defense')));

// --- moves -------------------------------------------------------------------
const moves = ivar(bulba, '@moves').items;
check('always has exactly 4 move slots', moves.length === 4, String(moves.length));
const learned = moves.filter((m) => ivar(m, '@id') !== 0);
check('level 50 Bulbasaur knows 4 real moves', learned.length === 4, String(learned.length));
check('each move starts at full PP',
  learned.every((m) => ivar(m, '@pp') === moveData(ivar(m, '@id')).totalpp));
const low = makePokemon({ species: 1, level: 2, speciesName: 'Bulbasaur' });
const lowMoves = ivar(low, '@moves').items.map((m) => ivar(m, '@id'));
check('a level 2 Pokemon pads unused move slots with 0',
  lowMoves.filter((id) => id === 0).length === 3, lowMoves.join());

// --- flags -------------------------------------------------------------------
const shiny = makePokemon({ species: 25, level: 5, shiny: true, gender: 1, speciesName: 'Pikachu' });
check('a forced-shiny Pokemon reports shiny', describe(shiny).shiny === true);
check('gender flag is stored', ivar(shiny, '@genderflag') === 1);
const plain = makePokemon({ species: 25, level: 5, speciesName: 'Pikachu' });
check('an unforced Pokemon has no shinyflag ivar',
  plain.ivars.every(([k]) => k !== '@shinyflag'));
check('nature falls out of the personal ID',
  describe(plain).nature === ivar(plain, '@personalID') % 25);

// --- describe(): gender and ability -------------------------------------------
// Bulbasaur: GenderRate=FemaleOneEighth (threshold 31), one regular ability
// (Overgrow), hidden ability Chlorophyll.
const femaleBulba = makePokemon({ species: 1, level: 5, speciesName: 'Bulbasaur', gender: 1 });
check('a forced-female Pokemon describes as female', describe(femaleBulba).gender === 1);
const maleBulba = makePokemon({ species: 1, level: 5, speciesName: 'Bulbasaur', gender: 0 });
check('a forced-male Pokemon describes as male', describe(maleBulba).gender === 0);
const naturalBulba = makePokemon({ species: 1, level: 5, speciesName: 'Bulbasaur' });
check('an unforced Pokemon derives a gender from its personal ID',
  describe(naturalBulba).gender === 0 || describe(naturalBulba).gender === 1);
check('a species with a single ability always describes it, forced or not',
  describe(naturalBulba).ability === describe(femaleBulba).ability);
const hiddenBulba = makePokemon({ species: 1, level: 5, speciesName: 'Bulbasaur', ability: 2 });
check('a forced-hidden-ability override changes the described ability',
  describe(hiddenBulba).ability !== describe(naturalBulba).ability);

// Magnemite: GenderRate=Genderless
const magnemite = makePokemon({ species: 81, level: 5, speciesName: 'Magnemite' });
check('a genderless species describes as genderless regardless of the personal ID',
  describe(magnemite).gender === null);

// --- validation --------------------------------------------------------------
const rejects = (fn) => { try { fn(); return false; } catch { return true; } };
check('rejects an out-of-range species', rejects(() => makePokemon({ species: 99999, level: 5 })));
check('rejects level 0', rejects(() => makePokemon({ species: 1, level: 0 })));
check('rejects level 101', rejects(() => makePokemon({ species: 1, level: 101 })));

// --- injection into a real save ---------------------------------------------
const FILE = listSaves()[0];
if (!FILE) { console.log('\nno saves found; skipping the injection checks'); check.finish(); }
console.log(`\ninjecting into ${FILE} (in memory only)\n`);
const save = readSave(FILE);
const before = dumpAll(save.streams);

// The save on disk is whatever the user last wrote, so assert on *changes*
// rather than on absolute counts.
const startParty = views.party(save).length;
const freeBox = views.boxes(save).find((b) => b.count === 0)?.index ?? 0;
console.log(`  (starting party: ${startParty}, using empty box ${freeBox + 1})`);

const room = PARTY_MAX - startParty;
const added = Math.min(2, room);
for (let i = 0; i < added; i++) addToParty(save, { species: i === 0 ? 1 : 4, level: 25 });
const p = views.party(save);
check('the party grew by what we added', p.length === startParty + added, `${startParty} -> ${p.length}`);
if (added) {
  check('the injected Pokemon resolves its species name',
    !!p[startParty].speciesName, p[startParty].speciesName || '(none)');
}
check('summary counts the party', views.summary(save).partyCount === p.length);

let filled = p.length;
for (let i = 0; i < PARTY_MAX + 1; i++) {
  try { addToParty(save, { species: 7, level: 5 }); filled++; } catch { /* full */ }
}
check('the party stops at 6', views.party(save).length === PARTY_MAX, String(views.party(save).length));
check('a further party add is refused', rejects(() => addToParty(save, { species: 7, level: 5 })));

addToBox(save, freeBox, { species: 150, level: 70 });
const b = views.boxes(save);
check('the empty box now holds 1', b[freeBox].count === 1, String(b[freeBox].count));
check('box slots stay at 30',
  save.section('storage').ivars.find(([k]) => k === '@boxes')[1]
    .items[freeBox].ivars.find(([k]) => k === '@pokemon')[1].items.length === BOX_SIZE);

// --- survives a Marshal round trip ------------------------------------------
const out = dumpAll(save.streams);
const reread = loadAll(out);
check('the edited save still has 15 streams', reread.length === 15, String(reread.length));
const rparty = reread[0].value.ivars.find(([k]) => k === '@party')[1];
check('the party survives a save/load cycle', rparty.items.length === PARTY_MAX, String(rparty.items.length));
if (added) {
  check('the injected Pokemon keeps its species', ivar(rparty.items[startParty], '@species') === 1);
  check('the injected Pokemon keeps its stats', ivar(rparty.items[startParty], '@totalhp') > 0);
  check('the injected nickname survives UTF-8',
    typeof strToJs(ivar(rparty.items[startParty], '@name')) === 'string');
}

// --- removal restores the original file --------------------------------------
removeFromBox(save, freeBox, 0);
while (views.party(save).length > startParty) removeFromParty(save, views.party(save).length - 1);
check('everything we added was removed again',
  views.party(save).length === startParty && views.boxes(save)[freeBox].count === 0);
const after = dumpAll(save.streams);
check('removing every injected Pokemon reproduces the original bytes',
  Buffer.compare(Buffer.from(before), Buffer.from(after)) === 0,
  `${before.length} vs ${after.length}`);

// --- box <-> party moves -----------------------------------------------------
addToBox(save, freeBox, { species: 393, level: 12 });
boxToParty(save, freeBox, 0);
check('boxToParty moves the Pokemon',
  views.party(save).length === startParty + 1 && views.boxes(save)[freeBox].count === 0);
removeFromParty(save, views.party(save).length - 1);
check('final state is clean again',
  Buffer.compare(Buffer.from(dumpAll(save.streams)), Buffer.from(before)) === 0);

check.finish();
