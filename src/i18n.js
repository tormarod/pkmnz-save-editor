// UI language. The game itself is Spanish, so Spanish is the default; English
// is here because the editor's chrome was written in it.
//
// Every string the editor itself writes goes through t() (UI text) or pick()
// (the { es, en } pairs in schema.js and the annotation bundle). The only
// English left is what the save engine throws as an Error message, which the
// UI surfaces verbatim in a toast.

import { es } from './locales/es.js';
import { en } from './locales/en.js';

const TABLES = { es, en };
const KEY = 'pkmnz.lang';

export const LANGS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
];

let current = 'es';
try {
  const saved = localStorage.getItem(KEY);
  if (saved && TABLES[saved]) current = saved;
} catch {
  // localStorage can throw in a locked-down browser; the default is fine.
}

export const lang = () => current;

export function setLang(code) {
  if (!TABLES[code] || code === current) return false;
  current = code;
  try { localStorage.setItem(KEY, code); } catch { /* not worth reporting */ }
  return true;
}

/**
 * Look up `key`, falling back to the other language and finally to the key
 * itself - a missing string shows something readable, never `undefined`.
 *
 * `t('x.y', { n: 3 })` fills `{n}` placeholders.
 */
export function t(key, vars) {
  const raw = TABLES[current]?.[key]
    ?? TABLES[current === 'es' ? 'en' : 'es']?.[key]
    ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/**
 * Pick the right side of an `{ es, en }` pair - an annotation from the bundle,
 * or a field label from schema.js - falling back to whichever one exists. A
 * plain string passes straight through, so a field with only one spelling (or
 * one the schema does not name at all) still renders.
 */
export function pick(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  return entry[current] || entry[current === 'es' ? 'en' : 'es'] || null;
}
