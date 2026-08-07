// Map id -> story chapter, for grouping the ~820 generated story flags.
//
// This is the one piece of judgement in the whole pipeline. Map ids in Pokemon Z
// run roughly in the order the player sees them, so a range table gets most
// flags into the right chapter - but only roughly. Generic maps repeat across
// the whole game (`Casa` x32, `Centro Pokémon` x23, `Bastión Pokémon` x18) and
// land in whichever chapter their id happens to fall in, which will sometimes
// read slightly off.
//
// The mitigation is in the UI, not here: every row shows its map id and name, so
// a flag filed under the wrong chapter is still identifiable at a glance.
//
// Boundaries were read off the map list in id order - see
// docs/switches-variables.md.

/** [firstMapId, chapterKey, Spanish title] - ranges run to the next entry. */
const RANGES = [
  [1, 'ch01', 'Prólogo: Pueblo Lienzo y Pueblo Vinilo'],
  [14, 'ch02', 'Ciudad Grisalla y la primera medalla'],
  [24, 'ch03', 'Pueblo Acrílico y Pueblo Collage'],
  [35, 'ch04', 'Chateau Rosillon y la Vieja Biblioteca'],
  [41, 'ch05', 'Pueblo Profano y el Pantano'],
  [59, 'ch06', 'Ciudad Óleo'],
  [80, 'ch07', 'Ciudad Novarte y Chateau Lanto'],
  [102, 'ch08', 'Pueblo Petroglifo y Fort Leviatán'],
  [113, 'ch09', 'Pueblo Bodegón y el Restaurante Le Chonk'],
  [127, 'ch10', 'Ciudad Relieve, Petrocueva y Viejo Vánitas'],
  [146, 'ch11', 'Gambón Rouge y el Hospicio Caduco'],
  [160, 'ch12', 'Ciudad Luminalia'],
  [207, 'ch13', 'Las Cámaras de Reflexión y el rey Malvo'],
  [222, 'ch14', 'La Prisión del Olvido'],
  [230, 'ch15', 'Ciudad Romantis, Gruta Helada y Ciudad Batik'],
  [262, 'ch16', 'La Torre Oscura'],
  [283, 'ch17', 'Pueblo Fresco, Pueblo Mosaico y Ciudad Fluxus'],
  [314, 'ch18', 'La Batalla de Kalos Este y la Antigua Forja'],
  [351, 'ch19', 'Bosque Errante, Circo Sanguino y Ciudad Yantra'],
  [431, 'ch20', 'El Arma Definitiva y Pueblo Cromlech'],
];

/** Chapter key for a map id, or null when there is no map to go on. */
export function chapterOf(mapId) {
  if (!Number.isInteger(mapId) || mapId < 1) return null;
  let key = RANGES[0][1];
  for (const [first, k] of RANGES) {
    if (mapId < first) break;
    key = k;
  }
  return key;
}

/** `{ ch01: 'Prólogo: …', … }`, in story order, for the group headers. */
export const CHAPTER_TITLES = Object.fromEntries(RANGES.map(([, k, title]) => [k, title]));

/** Chapter keys in story order. */
export const CHAPTER_KEYS = RANGES.map(([, k]) => k);
