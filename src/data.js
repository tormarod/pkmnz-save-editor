// The baked game-data bundle (see tools/build-data.js).
//
// The published site loads it over HTTP; the Node tests inject it directly.
// Nothing here touches a filesystem, so every module that depends on it stays
// usable in the browser.

let DATA = null;

export function setData(bundle) {
  DATA = bundle;
  return DATA;
}

export function data() {
  if (!DATA) {
    throw new Error('game data has not been loaded yet — call loadData() first');
  }
  return DATA;
}

export function isLoaded() {
  return DATA !== null;
}

export async function loadData(url = './data/gamedata.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (HTTP ${res.status})`);
  return setData(await res.json());
}
