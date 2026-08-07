// The group vocabulary for the Game state tab: which cards exist, what they are
// called and what order they appear in. Baked into gamedata.json so the UI does
// not carry a second copy that can drift from the annotations.

import { CHAPTER_TITLES, CHAPTER_KEYS } from './chapters.js';

// Gameplay first, in rough order of how likely a player is to want it.
const GAMEPLAY = [
  ['mode', 'Dificultad y modos de juego', 'Difficulty and game modes'],
  ['badges', 'Medallas y límite de nivel', 'Badges and level cap'],
  ['exp', 'Experiencia', 'Experience'],
  ['battle', 'Combate', 'Battle'],
  ['field', 'Encuentros y mapa', 'Encounters and field'],
  ['amulets', 'Amuletos de tipo', 'Type amulets'],
  ['comfort', 'Comodidad e interfaz', 'Comfort and interface'],
  ['quests', 'Tablón de Estrellas', 'Star quest board'],
  ['counters', 'Contadores y colecciones', 'Counters and collections'],
  ['legendaries', 'Legendarios', 'Legendaries'],
  ['minigame', 'Minijuegos y puzles', 'Minigames and puzzles'],
  ['character', 'Creación del personaje', 'Character creation'],
  ['world', 'Estado del mundo', 'World state'],
  ['system', 'Motor y restos de Essentials', 'Engine and Essentials leftovers'],
];

const CHAPTERS = CHAPTER_KEYS.map((k) => [k, CHAPTER_TITLES[k], CHAPTER_TITLES[k]]);

// Placeholders last: reserved slots and flags with no story to belong to.
const TAIL = [['none', 'Sin clasificar y reservados', 'Unclassified and reserved']];

const ALL = [...GAMEPLAY, ...CHAPTERS, ...TAIL];

/** Group keys whose cards start expanded - the gameplay ones. */
export const OPEN_BY_DEFAULT = GAMEPLAY.map(([k]) => k);

/** `{ key: { es, en, story } }` in display order, for the bundle. */
export const GROUPS = Object.fromEntries(ALL.map(([key, es, en]) => [
  key,
  { es, en, ...(key.startsWith('ch') ? { story: true } : null) },
]));

/** Group keys in display order. */
export const GROUP_ORDER = ALL.map(([k]) => k);
