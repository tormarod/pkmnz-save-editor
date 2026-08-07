// The Trainer tab: scalar fields, badge checkboxes, and Pokédex counters.

import { $, el } from '../dom.js';
import { api, fieldGrid, setValue } from '../session.js';

export async function loadTrainer() {
  const t = await api('/api/trainer');
  const body = $('#trainerBody');
  body.innerHTML = '';

  const card = el('div', 'card');
  card.append(el('h3', null, 'Trainer'));
  card.append(fieldGrid(t.fields));
  body.append(card);

  const bcard = el('div', 'card');
  bcard.append(el('h3', null, 'Badges'));
  const badges = el('div', 'badges');
  for (const b of t.badges) {
    const lab = el('label');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = b.value;
    cb.onchange = () => setValue(b.path, cb.checked, lab, `Badge ${b.index + 1}`);
    lab.append(cb, el('span', null, `Badge ${b.index + 1}`));
    badges.append(lab);
  }
  bcard.append(badges);
  body.append(bcard);

  const dcard = el('div', 'card');
  dcard.append(el('h3', null, 'Pokédex'));
  for (const d of t.dex) {
    const row = el('div', 'barRow');
    const label = el('div', 'barLabel');
    const name = d.ivar.replace(/^@/, '');
    label.append(
      el('span', null, name.charAt(0).toUpperCase() + name.slice(1)),
      el('span', null, `${d.count} of ${d.total}`),
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
