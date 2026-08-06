// Minimal static server for local development. GitHub Pages serves the same
// files; this just lets you try them before pushing, since ES modules and
// fetch() do not work from a file:// URL.
//
//   node tools/serve.js [port] [root]
//
// The optional root lets the smoke test serve the site from a subdirectory, the
// way GitHub Pages serves it under /<repo>/.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2]) || 4173;
const ROOT = process.argv[3]
  ? resolve(process.argv[3])
  : join(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = normalize(url.pathname).replace(/^[\\/]+/, '');
  if (rel === '' || rel.endsWith('\\') || rel.endsWith('/')) rel = join(rel, 'index.html');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT}\n  http://127.0.0.1:${PORT}\n`);
});
