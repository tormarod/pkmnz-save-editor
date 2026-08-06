// Adds items to a real save's bag and checks they land in the right pocket,
// stack correctly, and survive a Marshal round trip.
import { addItem, MAX_QUANTITY } from '../src/bag.js';
import { itemPocket } from '../src/gamedata.js';
import { loadAll, dumpAll } from '../src/marshal.js';
import * as views from '../src/views.js';
import { loadBundle, readSave, listSaves, makeChecker } from './helpers.js';

loadBundle();
const check = makeChecker();

console.log('\nadding items\n');

const FILE = listSaves()[0];
if (!FILE) { console.log('\nno saves found; skipping the bag checks'); check.finish(); }
console.log(`\ninjecting into ${FILE} (in memory only)\n`);
const save = readSave(FILE);
const before = dumpAll(save.streams);

// Item 1 (REPEL) is Pocket 1 ("Items") per PBS/items.txt.
const startQty = views.bag(save)[itemPocket(1)]?.items.find((i) => i.id === 1)?.qty ?? 0;

const r1 = addItem(save, { item: 1, qty: 5 });
check('addItem reports the item\'s own pocket', r1.pocket === itemPocket(1), `${r1.pocket} vs ${itemPocket(1)}`);
check('addItem is not stacked the first time', r1.stacked === (startQty > 0));

const pocketAfter = views.bag(save)[itemPocket(1)];
const entry = pocketAfter.items.find((i) => i.id === 1);
check('the item shows up in its pocket', !!entry);
check('the quantity matches what was added', entry.qty === startQty + 5, `${entry.qty} vs ${startQty + 5}`);
check('the item resolves its name', entry.name === 'REPEL' || !!entry.name, entry.name || '(none)');

// Adding again stacks onto the same entry instead of duplicating the row.
const countBefore = pocketAfter.items.length;
const r2 = addItem(save, { item: 1, qty: 3 });
const pocketAfter2 = views.bag(save)[itemPocket(1)];
check('a second add stacks onto the existing entry', pocketAfter2.items.length === countBefore, `${pocketAfter2.items.length} vs ${countBefore}`);
check('stacked quantity accumulates', r2.qty === startQty + 8, `${r2.qty} vs ${startQty + 8}`);
check('addItem reports stacked on the second call', r2.stacked === true);

// Quantity clamps at MAX_QUANTITY rather than overflowing.
const r3 = addItem(save, { item: 1, qty: MAX_QUANTITY });
check('quantity clamps at the max stack size', r3.qty === MAX_QUANTITY, String(r3.qty));

// A different item lands in a different pocket (a consumable vs. a key
// item), each pocket keeps its own entries.
const KEY_ITEM = 568; // Controls Guide, Pocket 8 per PBS/items.txt
const keyStartQty = views.bag(save)[itemPocket(KEY_ITEM)]?.items.find((i) => i.id === KEY_ITEM)?.qty ?? 0;
const r4 = addItem(save, { item: KEY_ITEM, qty: 1 });
check('a different item goes to its own pocket', r4.pocket === 8, String(r4.pocket));
check('the two pockets stay separate',
  views.bag(save)[1].items.some((i) => i.id === 1) && views.bag(save)[8].items.some((i) => i.id === KEY_ITEM));

// --- validation ---------------------------------------------------------------
const rejects = (fn) => { try { fn(); return false; } catch { return true; } };
check('rejects an unknown item id', rejects(() => addItem(save, { item: 999999, qty: 1 })));
check('rejects a non-integer item id', rejects(() => addItem(save, { item: NaN, qty: 1 })));

// --- survives a Marshal round trip ---------------------------------------------
const dumped = dumpAll(save.streams);
const reread = loadAll(dumped);
check('the edited save still has 15 streams', reread.length === 15, String(reread.length));

// --- cleanup: put the pockets back exactly as they were -----------------------
const pocket1 = save.section('bag').ivars.find(([k]) => k === '@pockets')[1].items[1];
const idx1 = pocket1.items.findIndex((e) => e.items[0] === 1);
if (startQty > 0) pocket1.items[idx1].items[1] = startQty;
else if (idx1 !== -1) pocket1.items.splice(idx1, 1);

const pocket8 = save.section('bag').ivars.find(([k]) => k === '@pockets')[1].items[8];
const idx8 = pocket8.items.findIndex((e) => e.items[0] === KEY_ITEM);
if (keyStartQty > 0) pocket8.items[idx8].items[1] = keyStartQty;
else if (idx8 !== -1) pocket8.items.splice(idx8, 1);

const after = dumpAll(save.streams);
check('removing every injected item reproduces the original bytes',
  Buffer.compare(Buffer.from(before), Buffer.from(after)) === 0,
  `${before.length} vs ${after.length}`);

check.finish();
