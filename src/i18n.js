// UI language. The game itself is Spanish, so Spanish is the default; English
// is here because the editor's chrome was written in it.
//
// Only the header, the summary and the Game state tab go through t() so far -
// Party / Bag / Dex / Trainer / World / Raw still hold English literals. That
// is deliberate: converting all seven tabs at once is a large mechanical diff
// that would bury the feature.

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
 * Pick the right side of an annotation's `{ es, en }` pair, falling back to
 * whichever one exists. Game content is Spanish-only for now, so this almost
 * always returns `es` - but it never returns blank.
 */
export function pick(entry) {
  if (!entry) return null;
  return entry[current] || entry[current === 'es' ? 'en' : 'es'] || null;
}
