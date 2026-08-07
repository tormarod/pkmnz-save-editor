// Boots the built site in a real browser and checks it actually comes up.
//
// The app has no bundler and no build step, so nothing catches a bad import
// path, a missing data file or a stale module reference until a browser tries
// to load it. This gates the deploy on the page working rather than shipping a
// white screen.
//
// It serves _site from a subdirectory so the URL matches how GitHub Pages
// serves the repo (/pkmnz-save-editor/), which is what would break if any path
// in the page were absolute instead of relative.
//
//   npm install --no-save playwright && npx playwright install chromium
//   node test/smoke.js

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeChecker, SAVE_DIR, listSaves } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'pkmnz-save-editor';
const PORT = Number(process.env.SMOKE_PORT) || 4199;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('\nplaywright is not installed — skipping the smoke test');
  console.log('  npm install --no-save playwright && npx playwright install chromium\n');
  process.exit(0);
}

// No shell: process.execPath contains spaces on Windows ("C:\Program Files\…").
const run = (cmd, args, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`))));
});

const tmp = await mkdtemp(join(tmpdir(), 'pkmnz-smoke-'));
const siteDir = join(tmp, BASE);
await run(process.execPath, [join(ROOT, 'tools', 'build-site.js'), siteDir]);

const server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.js'), String(PORT), tmp], {
  stdio: 'ignore',
});
const stop = async () => {
  server.kill();
  await rm(tmp, { recursive: true, force: true });
};

const check = makeChecker();
const consoleErrors = [];
const failedRequests = [];

try {
  // wait for the server
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/${BASE}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Species/item sprites (see src/sprites.js) are a best-effort fetch against
  // a public CDN: this fangame has custom species/items the CDN never has,
  // and the UI already handles a missing sprite by just not showing one.
  // Don't let those expected misses fail a test that's checking the app's
  // own code, not a third party's uptime.
  const isSpriteRequest = (url) => url.includes('raw.githubusercontent.com/PokeAPI/sprites');
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('requestfailed', (r) => { if (!isSpriteRequest(r.url())) failedRequests.push(r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && !isSpriteRequest(r.url())) failedRequests.push(`${r.status()} ${r.url()}`); });

  console.log(`\nloading http://127.0.0.1:${PORT}/${BASE}/\n`);
  await page.goto(`http://127.0.0.1:${PORT}/${BASE}/`, { waitUntil: 'networkidle' });

  check('the page has its title', (await page.title()).includes('save editor'));
  check('nothing failed to load', failedRequests.length === 0, failedRequests.join(', '));
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('the drop zone is visible', await page.locator('#dropzone').isVisible());

  const status = await page.locator('#dataStatus').textContent();
  check('the game data bundle loaded', /Labels loaded:/.test(status || ''), status || '(empty)');
  const species = Number(/(\d+) species/.exec(status || '')?.[1] || 0);
  check('the bundle has species in it', species > 900, `${species} species`);
  check('no error banner', !(await page.locator('#banner').isVisible()));

  // If a real save is around, drive the whole pipeline through the UI.
  const saves = existsSync(SAVE_DIR) ? listSaves() : [];
  if (!saves.length) {
    console.log(`\n  (no saves in ${SAVE_DIR} — skipping the open/edit checks)`);
  } else {
    const bytes = readFileSync(join(SAVE_DIR, saves[0]));
    await page.evaluate(async ({ name, b64 }) => {
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([buf], name));
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, { name: saves[0], b64: bytes.toString('base64') });

    await page.locator('nav.tabs').waitFor({ state: 'visible', timeout: 15000 });
    check('opening a save hides the drop zone', !(await page.locator('#dropzone').isVisible()));
    check('opening a save reveals the tabs', await page.locator('nav.tabs').isVisible());
    const summary = await page.locator('#summary').innerText();
    check('the summary names the slot variable', /SLOT \(VAR 99\)/.test(summary), summary.split('\n').slice(0, 4).join(' '));
    const state = await page.locator('#gsList').innerText();
    check('the game state tab is described from the bundle',
      /Nuzlocke|obediencia|Amuleto/.test(state), state.split('\n').slice(0, 3).join(' '));
    check('still no console errors after opening', consoleErrors.length === 0, consoleErrors.join(' | '));
  }

  await browser.close();
} finally {
  await stop();
}

check.finish();
