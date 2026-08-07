// A pre-download sanity check, folded into the "what will change" modal as
// warnings rather than blocks - the point is catching a typo before it
// reaches the disk, not gatekeeping edits the user actually intends.

import { party as viewParty, bag as viewBag, summary as viewSummary } from './views.js';
import { MAX_QUANTITY } from './bag.js';
import { EXP_TABLE } from './expTable.js';
import { t } from './i18n.js';

export function validate(save) {
  const warnings = [];
  const party = viewParty(save);

  if (!party.length) warnings.push(t('validate.partyEmpty'));

  party.forEach((mon, i) => {
    if (!mon) return;
    const who = mon.nickname || mon.speciesName || t('validate.partySlot', { n: i + 1 });
    const evs = mon.stats.find((s) => s.ivar === '@ev')?.values || [];
    const evTotal = evs.reduce((sum, v) => sum + (v.value || 0), 0);
    if (evTotal > 510) warnings.push(t('validate.evTotal', { who, total: evTotal }));
    for (const v of evs) {
      if ((v.value || 0) > 252) warnings.push(t('validate.evSingle', { who, value: v.value }));
    }
    if (mon.hp !== null && mon.totalhp !== null && mon.hp > mon.totalhp) {
      warnings.push(t('validate.hpOver', { who, hp: mon.hp, max: mon.totalhp }));
    }
    if (mon.growthRate !== null && mon.exp !== null) {
      const table = EXP_TABLE[mon.growthRate];
      if (mon.exp > table[table.length - 1]) {
        warnings.push(t('validate.expOver', { who, exp: mon.exp }));
      }
    }
    if (mon.egg) {
      if (mon.moves.length) warnings.push(t('validate.eggMoves', { who }));
      if (mon.nickname) warnings.push(t('validate.eggNickname', { who }));
    }
  });

  for (const pocket of viewBag(save)) {
    for (const it of pocket.items) {
      if ((it.qty || 0) > MAX_QUANTITY) {
        warnings.push(t('validate.qtyOver', {
          name: it.name || t('change.itemN', { n: it.id }), qty: it.qty, max: MAX_QUANTITY,
        }));
      }
    }
  }

  const s = viewSummary(save);
  if (s.slotMismatch) {
    warnings.push(t('validate.slotMismatch', { file: s.file, expected: s.expectedFile }));
  }

  return warnings;
}
