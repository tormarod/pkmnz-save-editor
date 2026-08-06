// Assembles the publishable site into _site/.
//
// There is no bundler here — the "build" is just picking the files the page
// actually needs, so tests, tools and the git history stay off gh-pages.
//
//   node tools/build-site.js [outDir]

import { cp, rm, mkdir, stat, readdir } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, '_site'));

/** Everything the published page loads, and nothing else. */
const INCLUDE = ['index.html', 'app.js', 'style.css', 'src', 'data'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const name of INCLUDE) {
  const from = join(ROOT, name);
  try {
    await stat(from);
  } catch {
    console.error(`missing: ${name}`);
    process.exit(1);
  }
  await cp(from, join(OUT, name), { recursive: true });
}

// Pages would otherwise run the output through Jekyll, which drops _-prefixed
// paths and can mangle things unexpectedly.
writeFileSync(join(OUT, '.nojekyll'), '');

// Sanity: the data bundle must be there, or the site boots into a dead page.
const bundle = join(OUT, 'data', 'gamedata.json');
const size = (await stat(bundle)).size;
if (size < 1024) {
  console.error('data/gamedata.json looks empty — run tools/build-data.js first');
  process.exit(1);
}

async function count(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? await count(join(dir, e.name)) : 1;
  }
  return n;
}

console.log(`built ${OUT}`);
console.log(`  ${await count(OUT)} files, data bundle ${Math.round(size / 1024)} KB`);
