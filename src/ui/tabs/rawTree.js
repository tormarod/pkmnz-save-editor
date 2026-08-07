// The Raw tree tab: a lazy-expanding view of every Marshal stream, for fields
// no dedicated tab exposes yet.

import { $, el } from '../dom.js';
import { t } from '../../i18n.js';
import { api, boundInput } from '../session.js';

// Ruby/Marshal types that have a glossary entry (raw.type.*) to hang off the
// bare type name every value in this tab is labeled with.
const GLOSSED = ['nil', 'bool', 'int', 'str', 'float', 'sym', 'bignum', 'array', 'hash',
  'obj', 'userdef', 'usrmarshal', 'struct', 'class', 'module', 'regexp'];

async function treeChildren(path) {
  return (await api('/api/tree', { body: JSON.stringify({ path }) })).children;
}

function treeNode(child, path) {
  const node = el('div', 'node');
  const self = el('div', 'self');
  const tw = el('span', `twist${child.expandable ? '' : ' leaf'}`, child.expandable ? '▸' : '·');
  self.append(tw);
  self.append(el('span', 'key', child.label));
  const ty = el('span', 'ty', child.type);
  if (GLOSSED.includes(child.type)) ty.title = t(`raw.type.${child.type}`);
  self.append(ty);

  if (child.scalar) {
    self.append(boundInput(self, { ...child, path }));
  } else {
    self.append(el('span', 'pv', child.preview));
  }
  if (child.resolved) self.append(el('span', 'resolved', `= ${child.resolved}`));
  if (child.note) self.append(el('span', 'note', child.note));
  node.append(self);

  // The whole row is the hit target, not just the chevron — these rows are the
  // one navigation control this tab has. Clicks that land on an editable value
  // are the input's, not the row's.
  let kids = null;
  if (child.expandable) {
    self.classList.add('openable');
    self.onclick = async (e) => {
      if (e.target.closest('input, select, button')) return;
      if (kids) {
        kids.classList.toggle('hidden');
        self.classList.toggle('open', !kids.classList.contains('hidden'));
        return;
      }
      self.classList.add('open');
      kids = el('div');
      node.append(kids);
      try {
        for (const c of await treeChildren(path)) {
          if (c.truncated) { kids.append(el('div', 'trunc', t('raw.more', { n: c.truncated }))); continue; }
          kids.append(treeNode(c, [...path, c.step]));
        }
      } catch (e2) { kids.append(el('div', 'trunc', e2.message)); }
    };
  }
  return node;
}

export async function loadTree() {
  const box = $('#tree');
  box.innerHTML = '';
  for (const c of await treeChildren([])) {
    box.append(treeNode(c, [c.step]));
  }
}
