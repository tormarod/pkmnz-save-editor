// Builds a PokeBattle_Pokemon Marshal object the same way the game's
// PokeBattle_Pokemon#initialize does, so an injected Pokemon is indistinguishable
// from a caught one.
//
// Mirrored from 122_PokeBattle_Pokemon.rb: initialize, calcStats, calcHP,
// calcStat, level=, nature, gender, isShiny?, and PBMove#initialize.

import {
  RObject, RArray, jsToStr, strToJs, bignumToJs, getIvar, setIvar,
} from './marshal.js';
import { speciesData, speciesExists, movesAtLevel, movePP } from './gamedata.js';
import { startExperience, levelFromExperience, MAXLEVEL } from './expTable.js';

const HP = 0; // PBStats::HP

const rand = (n) => Math.floor(Math.random() * n);

/** PokeBattle_Pokemon#calcHP */
export function calcHP(base, level, iv, ev) {
  if (base === 1) return 1;
  return Math.floor(((base * 2 + iv + (ev >> 2)) * level) / 100) + level + 10;
}

/** PokeBattle_Pokemon#calcStat */
export function calcStat(base, level, iv, ev, pv) {
  return Math.floor((Math.floor(((base * 2 + iv + (ev >> 2)) * level) / 100) + 5) * pv / 100);
}

/**
 * The six stats for a Pokemon, applying the nature multipliers exactly as
 * calcStats does (nature/5 gets +10%, nature%5 gets -10%).
 */
export function calcStats({ baseStats, level, iv, ev, nature }) {
  const pvalues = [100, 100, 100, 100, 100];
  const nd5 = Math.floor(nature / 5);
  const nm5 = nature % 5;
  if (nd5 !== nm5) { pvalues[nd5] = 110; pvalues[nm5] = 90; }
  const stats = [];
  for (let i = 0; i <= 5; i++) {
    stats[i] = i === HP
      ? calcHP(baseStats[i], level, iv[i], ev[i])
      : calcStat(baseStats[i], level, iv[i], ev[i], pvalues[i - 1]);
  }
  return stats;
}

/** The ivars a Pokemon's six stats are cached in, in PBStats order. */
export const STAT_IVARS = ['@totalhp', '@attack', '@defense', '@speed', '@spatk', '@spdef'];

/** Editing any of these changes the stats, so they have to be recomputed. */
export const STAT_INPUTS = ['@iv', '@ev', '@exp', '@species', '@natureflag', '@personalID'];

const plain = (v) => (typeof v === 'number' ? v : v && v.t === 'bignum' ? bignumToJs(v) : 0);

/**
 * Recompute a Pokemon's cached stats from its species, level, IVs, EVs and
 * nature — what PokeBattle_Pokemon#calcStats does.
 *
 * The save stores the six stats as plain ivars and the game reads them straight
 * back; calcStats only runs on level-up, evolution, vitamins and the like. So
 * after editing IVs or EVs the cached values are stale until this is called.
 *
 * Current HP keeps its damage offset, exactly as calcStats does.
 */
export function recalcStats(mon) {
  if (!mon || mon.t !== 'obj' || mon.cls !== 'PokeBattle_Pokemon') {
    throw new Error('not a PokeBattle_Pokemon');
  }
  const species = plain(getIvar(mon, '@species'));
  const sd = speciesData(species);
  const level = levelFromExperience(plain(getIvar(mon, '@exp')), sd.growthRate);

  const iv = (getIvar(mon, '@iv')?.items || []).map(plain);
  const ev = (getIvar(mon, '@ev')?.items || []).map(plain);
  while (iv.length < 6) iv.push(0);
  while (ev.length < 6) ev.push(0);

  const flag = getIvar(mon, '@natureflag');
  const nature = flag === null || flag === undefined
    ? plain(getIvar(mon, '@personalID')) % 25
    : plain(flag);

  const stats = calcStats({ baseStats: sd.baseStats, level, iv, ev, nature });

  // calcStats keeps the damage taken, then clamps into range.
  const oldTotal = plain(getIvar(mon, '@totalhp'));
  const oldHp = plain(getIvar(mon, '@hp'));
  const diff = oldTotal - oldHp;
  let hp = stats[HP] - diff;
  if (hp <= 0) hp = 0;
  if (hp > stats[HP]) hp = stats[HP];

  STAT_IVARS.forEach((name, i) => setIvar(mon, name, stats[i]));
  setIvar(mon, '@hp', hp);

  return { level, nature, stats, hp };
}

/** The six contest-stat ivars, in the order the game's contest UI shows them. */
export const CONTEST_IVARS = ['@cool', '@beauty', '@cute', '@smart', '@tough', '@sheen'];
export const CONTEST_NAMES = ['Cool', 'Beauty', 'Cute', 'Smart', 'Tough', 'Sheen'];

/**
 * Set one contest stat (0-255), creating the ivar if this Pokemon never had
 * one set - makePokemon() doesn't set any, and plenty of wild-caught Pokemon
 * won't have entered a contest either.
 */
export function setContestStat(mon, ivarName, value) {
  if (!mon || mon.t !== 'obj' || mon.cls !== 'PokeBattle_Pokemon') {
    throw new Error('not a PokeBattle_Pokemon');
  }
  if (!CONTEST_IVARS.includes(ivarName)) throw new Error(`not a contest stat: ${ivarName}`);
  const n = Math.floor(Number(value));
  if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error('contest stats must be a whole number from 0 to 255');
  setIvar(mon, ivarName, n);
  return n;
}

/** Add a ribbon id to @ribbons, creating the ivar if this Pokemon has none. */
export function addRibbon(mon, ribbonId) {
  if (!mon || mon.t !== 'obj' || mon.cls !== 'PokeBattle_Pokemon') {
    throw new Error('not a PokeBattle_Pokemon');
  }
  const id = Math.floor(Number(ribbonId));
  if (!Number.isInteger(id) || id < 0) throw new Error('ribbon id must be a non-negative whole number');
  const items = (getIvar(mon, '@ribbons')?.items || []).map(plain);
  if (items.includes(id)) throw new Error('this Pokémon already has that ribbon');
  items.push(id);
  setIvar(mon, '@ribbons', RArray(items));
  return items;
}

/** Remove a ribbon id from @ribbons. */
export function removeRibbon(mon, ribbonId) {
  if (!mon || mon.t !== 'obj' || mon.cls !== 'PokeBattle_Pokemon') {
    throw new Error('not a PokeBattle_Pokemon');
  }
  const id = Math.floor(Number(ribbonId));
  const items = (getIvar(mon, '@ribbons')?.items || []).map(plain).filter((v) => v !== id);
  setIvar(mon, '@ribbons', RArray(items));
  return items;
}

/** PBMove.new(moveid) */
function makeMove(id) {
  return RObject('PBMove', [
    ['@pp', id ? movePP(id) : 0],
    ['@id', id],
    ['@ppup', 0],
  ]);
}

/** Random 32-bit personal ID, built byte by byte like the game does. */
function randomPersonalID() {
  return (rand(256) | (rand(256) << 8) | (rand(256) << 16)) + rand(256) * 0x1000000;
}

/**
 * Create a Pokemon.
 *
 * @param {object} opts
 * @param {number} opts.species    National Dex number
 * @param {number} opts.level      1..100
 * @param {object} [opts.trainer]  { id, name, gender, language } to set as OT
 * @param {string} [opts.nickname] defaults to the species name
 * @param {number[]} [opts.iv]     six values 0..31, random when omitted
 * @param {number[]} [opts.ev]     six values, zeroes when omitted
 * @param {number} [opts.item]     held item id
 * @param {number[]} [opts.moves]  up to 4 move ids; level-up moveset when omitted
 * @param {boolean} [opts.shiny]   force shiny on/off, or leave to the PID
 * @param {number} [opts.gender]   0 male, 1 female
 * @param {number} [opts.nature]   0..24
 * @param {number} [opts.ability]  0 first, 1 second, 2 hidden
 * @param {number} [opts.happiness]
 * @param {number} [opts.ball]
 * @param {number} [opts.obtainMap]
 * @param {boolean} [opts.egg]
 */
export function makePokemon(opts) {
  const {
    species, level, trainer, nickname, iv, ev, item = 0, moves,
    shiny, gender, nature, ability, happiness, ball = 0,
    obtainMap = 0, egg = false, speciesName,
  } = opts;

  if (!speciesExists(species)) throw new Error(`species ${species} does not exist`);
  if (!Number.isInteger(level) || level < 1 || level > MAXLEVEL) {
    throw new Error(`level must be a whole number from 1 to ${MAXLEVEL}`);
  }

  const sd = speciesData(species);

  const ivs = iv?.length === 6 ? iv.map((v) => clamp(v, 0, 31)) : [0, 0, 0, 0, 0, 0].map(() => rand(32));
  const evs = ev?.length === 6 ? ev.map((v) => clamp(v, 0, 255)) : [0, 0, 0, 0, 0, 0];
  const personalID = randomPersonalID();
  const trainerID = trainer?.id ?? 0;

  const exp = startExperience(level, sd.growthRate);
  // level is derived from exp, so re-derive it to be sure they agree
  const realLevel = levelFromExperience(exp, sd.growthRate);

  const effectiveNature = nature ?? personalID % 25;
  const stats = calcStats({ baseStats: sd.baseStats, level: realLevel, iv: ivs, ev: evs, nature: effectiveNature });

  const moveIds = (moves?.length ? moves : movesAtLevel(species, realLevel)).slice(0, 4);
  const moveObjs = [];
  for (let i = 0; i < 4; i++) moveObjs.push(makeMove(moveIds[i] || 0));

  // Ivar order follows the game's initialize so a fresh Pokemon looks native.
  const ivars = [
    ['@timeReceived', Math.floor(Date.now() / 1000)],
    ['@species', species],
    ['@personalID', personalID],
    ['@hp', egg ? 1 : stats[HP]],
    ['@totalhp', stats[HP]],
    ['@ev', RArray(evs.slice())],
    ['@iv', RArray(ivs.slice())],
    ['@trainerID', trainerID],
    ['@ot', jsToStr(trainer?.name ?? '')],
    ['@otgender', trainer?.gender ?? 2],
    ['@happiness', happiness ?? sd.happiness],
    ['@name', jsToStr(nickname || speciesName || `SPECIES${species}`)],
    ['@eggsteps', egg ? 1 : 0],
    ['@status', 0],
    ['@statusCount', 0],
    ['@item', item],
    ['@mail', null],
    ['@fused', null],
    ['@ribbons', RArray([])],
    ['@moves', RArray(moveObjs)],
    ['@ballused', ball],
    ['@exp', exp],
    ['@attack', stats[1]],
    ['@defense', stats[2]],
    ['@speed', stats[3]],
    ['@spatk', stats[4]],
    ['@spdef', stats[5]],
    ['@obtainMap', obtainMap],
    ['@obtainText', null],
    ['@obtainLevel', realLevel],
    ['@obtainMode', 0],
    ['@hatchedMap', 0],
  ];

  if (trainer?.language !== undefined) ivars.push(['@language', trainer.language]);
  // These flags are nil unless forced; the game reads them as "not set".
  if (shiny !== undefined && shiny !== null) ivars.push(['@shinyflag', !!shiny]);
  if (gender !== undefined && gender !== null) ivars.push(['@genderflag', gender]);
  if (nature !== undefined && nature !== null) ivars.push(['@natureflag', nature]);
  if (ability !== undefined && ability !== null) ivars.push(['@abilityflag', ability]);

  return RObject('PokeBattle_Pokemon', ivars);
}

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/** Derived facts about a Pokemon object, for display. */
export function describe(mon) {
  const g = (n) => getIvar(mon, n);
  const species = g('@species');
  const pid = g('@personalID') ?? 0;
  const tid = g('@trainerID') ?? 0;
  const natureFlag = g('@natureflag');
  const shinyFlag = g('@shinyflag');
  const a = (pid ^ tid) >>> 0;
  const derivedShiny = ((a & 0xffff) ^ ((a >>> 16) & 0xffff)) < 100; // SHINYPOKEMONCHANCE
  return {
    species,
    nickname: strToJs(g('@name') ?? jsToStr('')),
    nature: natureFlag ?? pid % 25,
    shiny: shinyFlag === undefined || shinyFlag === null ? derivedShiny : shinyFlag === true,
    level: levelFromExperience(g('@exp') ?? 0, speciesData(species).growthRate),
  };
}
