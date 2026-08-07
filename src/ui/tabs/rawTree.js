// The Raw tree tab: a lazy-expanding view of every Marshal stream, for fields
// no dedicated tab exposes yet.

import { $, el } from '../dom.js';
import { api, boundInput } from '../session.js';

// Ruby/Marshal type glossary for the Raw tree tab, where every value is
// labeled with its bare Marshal type name.
const TYPE_GLOSSARY = {
  nil: 'Ruby nil — "no value". Booleans and nil-by-default fields both read as this until something sets them.',
  bool: 'A true/false value.',
  int: 'A Fixnum — a plain integer.',
  str: 'A Ruby String (text).',
  float: 'A floating-point number.',
  sym: 'A Ruby Symbol — an internal, code-facing name (like :some_name), not user-facing text.',
  bignum: 'A Bignum — an integer too large for a Fixnum. Trainer IDs and similar values often show up here.',
  array: 'A Ruby Array — an ordered list. Expand it to see its entries.',
  hash: 'A Ruby Hash — a key/value map. Expand it to see its entries.',
  obj: 'A Ruby object with named instance variables (ivars). Expand it to see its fields.',
  userdef: 'Custom binary data the game serializes itself. Shown as raw bytes; not editable here.',
  usrmarshal: 'An object with its own custom Marshal encoding.',
  struct: 'A Ruby Struct — fixed, named fields, like a lightweight object.',
  class: 'A reference to a Ruby class itself (rare in save data).',
  module: 'A reference to a Ruby module (rare in save data).',
  regexp: 'A compiled regular expression (rare in save data).',
};

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
  if (TYPE_GLOSSARY[child.type]) ty.title = TYPE_GLOSSARY[child.type];
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
          if (c.truncated) { kids.append(el('div', 'trunc', `…${c.truncated} more not shown`)); continue; }
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
