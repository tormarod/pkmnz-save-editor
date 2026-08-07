// The World tab: PokemonGlobalMetadata's cross-map state (bike/surf/repel,
// day care, Pokedex viewing state, phone) grouped into sections for readability.

import { $, el } from '../dom.js';
import { api, fieldGrid, ensureKindOptions } from '../session.js';

const GROUPS = [
  { title: 'Movement', fields: ['@bicycle', '@surfing', '@diving', '@sliding', '@fishing', '@runtoggle', '@bridge', '@runningShoes', '@snagMachine', '@repel'] },
  { title: 'Day care', fields: ['@daycare', '@daycareEgg', '@daycareEggSteps'] },
  { title: 'Pokédex', fields: ['@pokedexUnlocked', '@pokedexDex', '@pokedexIndex', '@pokedexMode'] },
  { title: 'World & respawn', fields: ['@healingSpot', '@escapePoint', '@pokecenterMapId', '@visitedMaps', '@safariState', '@bugContestState'] },
  { title: 'Phone', fields: ['@phoneNumbers', '@phoneTime'] },
  { title: 'Progress', fields: ['@amuleto', '@shinyzador', '@flashUsed', '@seenStorageCreator', '@coins', '@sootsack', '@stepcount', '@happinessSteps', '@pokerusTime', '@safesave'] },
];

export async function loadWorld() {
  await ensureKindOptions('maps');
  const [{ fields }, { fields: playerFields }] = await Promise.all([api('/api/world'), api('/api/player')]);
  const body = $('#worldBody');
  body.innerHTML = '';

  const pcard = el('div', 'card');
  pcard.append(el('h3', null, 'Player position'));
  pcard.append(el('p', 'hint', 'Not validated: an unvisited map or an out-of-bounds x/y can strand or crash the game.'));
  pcard.append(fieldGrid(playerFields));
  body.append(pcard);

  const byIvar = new Map(fields.map((f) => [f.ivar, f]));
  const grouped = new Set();

  for (const g of GROUPS) {
    const present = g.fields.map((name) => byIvar.get(name)).filter(Boolean);
    present.forEach((f) => grouped.add(f.ivar));
    if (!present.length) continue;
    const card = el('div', 'card');
    card.append(el('h3', null, g.title));
    card.append(fieldGrid(present));
    body.append(card);
  }

  const leftover = fields.filter((f) => !grouped.has(f.ivar));
  if (leftover.length) {
    const card = el('div', 'card');
    card.append(el('h3', null, 'Other'));
    card.append(fieldGrid(leftover));
    body.append(card);
  }
}
