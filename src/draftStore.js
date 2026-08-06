// Persists in-progress edits to IndexedDB, keyed by the opened file's name, so
// a crash or accidental tab close doesn't silently lose a session's worth of
// edits. Nothing here ever leaves the browser - it's the same storage origin
// that read the file in the first place.

const DB_NAME = 'pkmnz-save-editor';
const STORE = 'drafts';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'name' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqValue(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * SHA-256 hex digest, so a restored draft can be checked against the file
 * that produced it (crypto.subtle needs a secure context - https or
 * localhost - so a plain length+sample checksum stands in when it's missing,
 * e.g. a page opened straight from disk via file://).
 */
export async function hashBytes(bytes) {
  if (window.crypto?.subtle) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch { /* fall through to the cheap hash below */ }
  }
  let h = bytes.length >>> 0;
  const step = Math.max(1, Math.floor(bytes.length / 512));
  for (let i = 0; i < bytes.length; i += step) h = (Math.imul(h, 31) + bytes[i]) >>> 0;
  return `f${bytes.length}-${h.toString(16)}`;
}

/** Best-effort: a failed draft write should never block editing. */
export async function saveDraft(name, hash, bytes) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      name, hash, bytes, updatedAt: Date.now(),
    });
    await txDone(tx);
  } catch { /* ignored */ }
}

export async function loadDraft(name) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    return (await reqValue(tx.objectStore(STORE).get(name))) || null;
  } catch {
    return null;
  }
}

export async function clearDraft(name) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(name);
    await txDone(tx);
  } catch { /* ignored */ }
}
