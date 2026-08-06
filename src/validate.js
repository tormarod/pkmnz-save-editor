// A pre-download sanity check, folded into the "what will change" modal as
// warnings rather than blocks - the point is catching a typo before it
// reaches the disk, not gatekeeping edits the user actually intends.

import { party as viewParty, bag as viewBag, summary as viewSummary } from './views.js';
import { MAX_QUANTITY } from './bag.js';
import { EXP_TABLE } from './expTable.js';

export function validate(save) {
  const warnings = [];
  const party = viewParty(save);

  if (!party.length) warnings.push('The party is empty.');

  party.forEach((mon, i) => {
    if (!mon) return;
    const who = mon.nickname || mon.speciesName || `party slot ${i + 1}`;
    const evs = mon.stats.find((s) => s.ivar === '@ev')?.values || [];
    const evTotal = evs.reduce((sum, v) => sum + (v.value || 0), 0);
    if (evTotal > 510) warnings.push(`${who}: EV total is ${evTotal}, over the 510 cap.`);
    for (const v of evs) {
      if ((v.value || 0) > 252) warnings.push(`${who}: a single EV is ${v.value}, over the 252 cap.`);
    }
    if (mon.hp !== null && mon.totalhp !== null && mon.hp > mon.totalhp) {
      warnings.push(`${who}: current HP (${mon.hp}) is above its max HP (${mon.totalhp}).`);
    }
    if (mon.growthRate !== null && mon.exp !== null) {
      const table = EXP_TABLE[mon.growthRate];
      if (mon.exp > table[table.length - 1]) {
        warnings.push(`${who}: exp (${mon.exp}) is higher than level 100 needs for its growth rate.`);
      }
    }
    if (mon.egg) {
      if (mon.moves.length) warnings.push(`${who}: this egg already has a moveset.`);
      if (mon.nickname) warnings.push(`${who}: this egg has a nickname.`);
    }
  });

  for (const pocket of viewBag(save)) {
    for (const it of pocket.items) {
      if ((it.qty || 0) > MAX_QUANTITY) {
        warnings.push(`${it.name || `item ${it.id}`}: quantity ${it.qty} is over the ${MAX_QUANTITY} stack cap.`);
      }
    }
  }

  const s = viewSummary(save);
  if (s.slotMismatch) {
    warnings.push(`This file is named ${s.file}, but variable 99 (save slot) says it should write to ${s.expectedFile}.`);
  }

  return warnings;
}
