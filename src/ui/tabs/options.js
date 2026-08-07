// The Options tab: PokemonSystem, i.e. the game's own Options screen
// (text speed, battle style, window size, volumes, difficulty, fonts).

import { $, el } from '../dom.js';
import { t } from '../../i18n.js';
import { api, fieldGrid } from '../session.js';

export async function loadOptions() {
  const { fields } = await api('/api/settings');
  const body = $('#optionsBody');
  body.innerHTML = '';

  const card = el('div', 'card');
  card.append(el('h3', null, t('options.title')));
  card.append(fieldGrid(fields));
  body.append(card);
}
