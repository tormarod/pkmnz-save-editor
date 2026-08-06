// Regression test for the "time must be positive" crash.
//
// RGSS is 32-bit Ruby 1.8: a Fixnum is 31-bit signed, so values above
// 2**30 - 1 must be marshalled as Bignums. Ruby's reader does a raw INT2FIX on
// a 'i' payload, so a too-large Fixnum silently wraps to a negative number —
// which is what made Time.at(@timeReceived) raise "time must be positive" on
// the trainer notes screen for an injected Pokemon.

import { dump, loadAll, bignumToJs, FIXNUM_MAX, FIXNUM_MIN, RArray, RObject } from '../src/marshal.js';
import { makePokemon } from '../src/create.js';
import { loadBundle, makeChecker } from './helpers.js';

loadBundle();
const check = makeChecker();

const tag = (n) => {
  const b = dump(n);
  return String.fromCharCode(b[2]); // 'i' Fixnum, 'l' Bignum
};
const roundTrip = (n) => {
  const v = loadAll(dump(n))[0].value;
  return typeof v === 'number' ? v : bignumToJs(v);
};

console.log('\nFixnum / Bignum boundary\n');

check(`${FIXNUM_MAX} is still a Fixnum`, tag(FIXNUM_MAX) === 'i', tag(FIXNUM_MAX));
check(`${FIXNUM_MAX + 1} becomes a Bignum`, tag(FIXNUM_MAX + 1) === 'l', tag(FIXNUM_MAX + 1));
check(`${FIXNUM_MIN} is still a Fixnum`, tag(FIXNUM_MIN) === 'i', tag(FIXNUM_MIN));
check(`${FIXNUM_MIN - 1} becomes a Bignum`, tag(FIXNUM_MIN - 1) === 'l', tag(FIXNUM_MIN - 1));

for (const n of [0, 1, -1, 122, 123, 1000, 65535, 16777216, FIXNUM_MAX, FIXNUM_MAX + 1,
  1786027327, 2147483647, 4294967295, FIXNUM_MIN, FIXNUM_MIN - 1, -2147483648]) {
  check(`${n} round-trips`, roundTrip(n) === n, String(roundTrip(n)));
}

// A real epoch timestamp is the value that broke the game.
const now = Math.floor(Date.now() / 1000);
check('a current unix timestamp is written as a Bignum', tag(now) === 'l', `${now} -> ${tag(now)}`);
check('it round-trips exactly', roundTrip(now) === now);

// Object-link indices must stay aligned once a Bignum is in the graph.
const shared = RArray([1, 2, 3]);
const graph = RArray([now, shared, 4294967295, shared, RObject('Foo', [['@a', shared]])]);
const back = loadAll(dump(graph))[0].value;
check('links still resolve after promoted Bignums',
  back.items[1] === back.items[3] && back.items[4].ivars[0][1] === back.items[1],
  'shared array identity preserved');
check('the Bignums in that graph survive',
  bignumToJs(back.items[0]) === now && bignumToJs(back.items[2]) === 4294967295);

console.log('\ninside a created Pokemon\n');

const mon = makePokemon({ species: 887, level: 100, speciesName: 'Dragapult' });
const reread = loadAll(dump(mon))[0].value;
const g = (o, n) => o.ivars.find(([k]) => k === n)?.[1];
const asNum = (v) => (typeof v === 'number' ? v : bignumToJs(v));

const t = asNum(g(reread, '@timeReceived'));
check('@timeReceived survives as a positive number', t > 0, String(t));
check('@timeReceived is a plausible date',
  Math.abs(t - Math.floor(Date.now() / 1000)) < 120, new Date(t * 1000).toISOString());
const pid = asNum(g(reread, '@personalID'));
check('@personalID survives exactly', pid >= 0 && pid <= 4294967295, String(pid));

// Force a personal ID above the Fixnum ceiling and confirm it stays positive.
let bigPidSeen = false;
for (let i = 0; i < 400 && !bigPidSeen; i++) {
  const m = makePokemon({ species: 1, level: 5, speciesName: 'Bulbasaur' });
  const p = asNum(g(loadAll(dump(m))[0].value, '@personalID'));
  if (p > FIXNUM_MAX) { bigPidSeen = true; check('a >2^30 personal ID stays positive', p > 0, String(p)); }
}
check('generated a personal ID above the Fixnum ceiling to test', bigPidSeen);

check.finish();
