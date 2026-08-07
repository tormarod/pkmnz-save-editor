// The World tab: PokemonGlobalMetadata's cross-map state (bike/surf/repel,
// day care, Pokedex viewing state, phone) grouped into sections for readability.

import { $, el } from '../dom.js';
import { t } from '../../i18n.js';
import { api, fieldGrid, ensureKindOptions } from '../session.js';

const GROUPS = [
  { title: 'world.movement', fields: ['@bicycle', '@surfing', '@diving', '@sliding', '@fishing', '@runtoggle', '@bridge', '@runningShoes', '@snagMachine', '@repel'] },
  { title: 'world.daycare', fields: ['@daycare', '@daycareEgg', '@daycareEggSteps'] },
  { title: 'world.dex', fields: ['@pokedexUnlocked', '@pokedexDex', '@pokedexIndex', '@pokedexMode'] },
  { title: 'world.respawn', fields: ['@healingSpot', '@escapePoint', '@pokecenterMapId', '@visitedMaps', '@safariState', '@bugContestState'] },
  { title: 'world.phone', fields: ['@phoneNumbers', '@phoneTime'] },
  { title: 'world.progress', fields: ['@amuleto', '@shinyzador', '@flashUsed', '@seenStorageCreator', '@coins', '@sootsack', '@stepcount', '@happinessSteps', '@pokerusTime', '@safesave'] },
];

export async function loadWorld() {
  await ensureKindOptions('maps');
  const [{ fields }, { fields: playerFields }] = await Promise.all([api('/api/world'), api('/api/player')]);
  const body = $('#worldBody');
  body.innerHTML = '';

  const pcard = el('div', 'card');
  pcard.append(el('h3', null, t('world.player')));
  pcard.append(el('p', 'hint', t('world.playerHint')));
  pcard.append(fieldGrid(playerFields));
  body.append(pcard);

  const byIvar = new Map(fields.map((f) => [f.ivar, f]));
  const grouped = new Set();

  for (const g of GROUPS) {
    const present = g.fields.map((name) => byIvar.get(name)).filter(Boolean);
    present.forEach((f) => grouped.add(f.ivar));
    if (!present.length) continue;
    const card = el('div', 'card');
    card.append(el('h3', null, t(g.title)));
    card.append(fieldGrid(present));
    body.append(card);
  }

  const leftover = fields.filter((f) => !grouped.has(f.ivar));
  if (leftover.length) {
    const card = el('div', 'card');
    card.append(el('h3', null, t('world.other')));
    card.append(fieldGrid(leftover));
    body.append(card);
  }
}
