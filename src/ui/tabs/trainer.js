// The Trainer tab: scalar fields, badge checkboxes, and Pokédex counters.

import { $, el } from '../dom.js';
import { t } from '../../i18n.js';
import { api, fieldGrid, setValue } from '../session.js';

export async function loadTrainer() {
  const view = await api('/api/trainer');
  const body = $('#trainerBody');
  body.innerHTML = '';

  const card = el('div', 'card');
  card.append(el('h3', null, t('trainer.title')));
  card.append(fieldGrid(view.fields));
  body.append(card);

  const bcard = el('div', 'card');
  bcard.append(el('h3', null, t('trainer.badges')));
  const badges = el('div', 'badges');
  for (const b of view.badges) {
    const name = t('trainer.badge', { n: b.index + 1 });
    const lab = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = b.value;
    cb.onchange = () => setValue(b.path, cb.checked, lab, name);
    lab.append(cb, el('span', null, name));
    badges.append(lab);
  }
  bcard.append(badges);
  body.append(bcard);

  const dcard = el('div', 'card');
  dcard.append(el('h3', null, t('trainer.dex')));
  for (const d of view.dex) {
    const row = el('div', 'barRow');
    const label = el('div', 'barLabel');
    label.append(
      el('span', null, t(d.ivar === '@seen' ? 'trainer.seen' : 'trainer.owned')),
      el('span', null, t('trainer.ofTotal', { count: d.count, total: d.total })),
    );
    const track = el('div', 'barTrack');
    const fill = el('div', 'barFill');
    fill.style.width = `${d.total ? Math.round((d.count / d.total) * 100) : 0}%`;
    track.append(fill);
    row.append(label, track);
    dcard.append(row);
  }
  body.append(dcard);
}
