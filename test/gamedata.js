// Confirms the Data/dexdata.dat record layout by cross-checking it against
// PBS/pokemon.txt, which is the text source the .dat is compiled from.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  speciesData, speciesCount, movesAtLevel, moveData, resolveAbility,
} from '../src/gamedata.js';
import { GROWTH_RATES, startExperience, levelFromExperience } from '../src/expTable.js';
import { data } from '../src/data.js';
import { GAME_DIR, loadBundle, haveGame, makeChecker } from './helpers.js';

loadBundle();
const check = makeChecker();

if (!haveGame()) {
  console.log(`\nno game install at ${GAME_DIR}; skipping the PBS cross-check`);
  console.log('(set PKMNZ_GAME_DIR to verify the bundle against the source files)\n');
  process.exit(0);
}

// parse PBS/pokemon.txt into the fields we want to compare
const txt = readFileSync(join(GAME_DIR, 'PBS/pokemon.txt'), 'utf8').replace(/^﻿/, '');
const pbs = {};
let cur = null;
for (const line of txt.split(/\r?\n/)) {
  const sec = /^\[(\d+)\]/.exec(line);
  if (sec) { cur = Number(sec[1]); pbs[cur] = {}; continue; }
  if (cur === null) continue;
  const m = /^(\w+)\s*=\s*(.*)$/.exec(line);
  if (m) pbs[cur][m[1]] = m[2].trim();
}

const GENDER = {
  AlwaysMale: 0, FemaleOneEighth: 31, Female25Percent: 63, Female50Percent: 127,
  Female75Percent: 191, FemaleSevenEighths: 225, AlwaysFemale: 254, Genderless: 255,
};

console.log(`\nchecking the baked bundle (${speciesCount()} species) against PBS/pokemon.txt\n`);

const abilityByName = new Map(Object.entries(data().abilities).map(([id, a]) => [a.i, Number(id)]));

let statsBad = 0; let growthBad = 0; let happyBad = 0; let genderBad = 0; let expBad = 0; let abilityBad = 0;
for (let id = 1; id <= speciesCount(); id++) {
  const p = pbs[id];
  if (!p || !p.BaseStats) continue;
  const d = speciesData(id);
  if (p.BaseStats.split(',').map(Number).join() !== d.baseStats.join()) statsBad++;
  if (GROWTH_RATES[d.growthRate] !== p.GrowthRate) growthBad++;
  if (Number(p.Happiness) !== d.happiness) happyBad++;
  if (GENDER[p.GenderRate] !== undefined && GENDER[p.GenderRate] !== d.genderRate) genderBad++;
  if (Number(p.BaseEXP) !== d.baseExp) expBad++;
  const expectAb = (p.Abilities || '').split(',').map((n) => abilityByName.get(n.trim())).filter(Boolean);
  const expectHa = p.HiddenAbility ? (abilityByName.get(p.HiddenAbility.trim()) || 0) : 0;
  if (expectAb.join() !== d.abilities.join() || expectHa !== d.hiddenAbility) abilityBad++;
}
check('base stats match PBS for every species', statsBad === 0, `${statsBad} mismatches`);
check('growth rates match PBS', growthBad === 0, `${growthBad} mismatches`);
check('base happiness matches PBS', happyBad === 0, `${happyBad} mismatches`);
check('gender rates match PBS', genderBad === 0, `${genderBad} mismatches`);
check('base EXP matches PBS', expBad === 0, `${expBad} mismatches`);
check('abilities match PBS', abilityBad === 0, `${abilityBad} mismatches`);

// Bulbasaur, spot-checked by hand against the PBS entry above
const bulba = speciesData(1);
check('Bulbasaur base stats are 50,49,49,45,65,65', bulba.baseStats.join() === '50,49,49,45,65,65', bulba.baseStats.join());
check('Bulbasaur growth rate is Parabolic', GROWTH_RATES[bulba.growthRate] === 'Parabolic', GROWTH_RATES[bulba.growthRate]);
check('Bulbasaur happiness is 70', bulba.happiness === 70, String(bulba.happiness));
check('Bulbasaur has one regular ability (Overgrow)', bulba.abilities.join() === String(abilityByName.get('OVERGROW')), bulba.abilities.join());
check('Bulbasaur\'s hidden ability is Chlorophyll', bulba.hiddenAbility === abilityByName.get('CHLOROPHYLL'), String(bulba.hiddenAbility));
check('resolveAbility falls back to the only regular ability', resolveAbility(1, 0, undefined) === abilityByName.get('OVERGROW'));
check('resolveAbility honours a hidden-ability override', resolveAbility(1, 0, 2) === abilityByName.get('CHLOROPHYLL'));

// exp table behaviour
// 6/5*18^3 - 15*18^2 + 100*18 - 140 = 3798.4 -> 3798, the Medium Slow curve
check('Parabolic level 18 exp is 3798', startExperience(18, bulba.growthRate) === 3798, String(startExperience(18, bulba.growthRate)));
check('exp -> level round-trips', levelFromExperience(startExperience(37, 3), 3) === 37);
check('Medium level 50 is 125000', startExperience(50, 0) === 125000);

// moveset selection
const m5 = movesAtLevel(1, 5).map((id) => moveData(id).internal);
check('Bulbasaur at level 5 knows Tackle and Growl', m5.join() === 'TACKLE,GROWL', m5.join());
// Sludge is learned at 21, so at 20 the last four stop at Razor Leaf
const m20 = movesAtLevel(1, 20).map((id) => moveData(id).internal);
check('Bulbasaur at level 20 keeps the last four level-up moves',
  m20.join() === 'POISONPOWDER,ACID,SLEEPPOWDER,RAZORLEAF', m20.join());
const m21 = movesAtLevel(1, 21).map((id) => moveData(id).internal);
check('Bulbasaur at level 21 picks up Sludge',
  m21.join() === 'ACID,SLEEPPOWDER,RAZORLEAF,SLUDGE', m21.join());
check('a move carries its PP', moveData(1).totalpp > 0, `move 1 pp=${moveData(1).totalpp}`);

check.finish();
