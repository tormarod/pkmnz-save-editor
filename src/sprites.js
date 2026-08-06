// Best-effort sprite/icon lookups against a public sprite CDN. Nothing here is
// bundled: species sprites are addressed by national dex number (works for
// official species; Pokemon Z's own fakemon numbers above the official dex
// just won't resolve, and the <img> is left to fail quietly - see attachSprite
// below). Item icons only cover a curated set of common vanilla items, keyed
// by their PBS internal name, since there is no reliable way to derive a
// PokeAPI item slug from this game's (often Spanish, often custom) item data.

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';

// PokeAPI's Pokemon sprite set covers the official national dex (1-1025 as of
// Gen 9). Pokemon Z numbers its own fakemon straight past that range, so
// there's no point even trying to fetch those - the browser would just log a
// 404 for every one of them.
const MAX_OFFICIAL_DEX = 1025;

export function speciesSpriteUrl(id) {
  if (!Number.isInteger(id) || id < 1 || id > MAX_OFFICIAL_DEX) return null;
  return `${SPRITE_BASE}/pokemon/${id}.png`;
}

// Internal PBS name -> PokeAPI item slug, for the items a player is most
// likely to actually be holding or carrying. Anything not listed here just
// renders as text, exactly as before - this is meant to make the common case
// (balls, potions, berries-adjacent healing items, evolution stones) easier
// to scan, not to catalog every item in the bag.
const ITEM_SLUGS = {
  POKEBALL: 'poke-ball', GREATBALL: 'great-ball', ULTRABALL: 'ultra-ball', MASTERBALL: 'master-ball',
  PREMIERBALL: 'premier-ball', LUXURYBALL: 'luxury-ball', DIVEBALL: 'dive-ball', NESTBALL: 'nest-ball',
  NETBALL: 'net-ball', REPEATBALL: 'repeat-ball', TIMERBALL: 'timer-ball', DUSKBALL: 'dusk-ball',
  QUICKBALL: 'quick-ball', HEALBALL: 'heal-ball', SAFARIBALL: 'safari-ball', LEVELBALL: 'level-ball',
  LUREBALL: 'lure-ball', MOONBALL: 'moon-ball', FRIENDBALL: 'friend-ball', LOVEBALL: 'love-ball',
  HEAVYBALL: 'heavy-ball', FASTBALL: 'fast-ball', SPORTBALL: 'sport-ball', PARKBALL: 'park-ball',
  DREAMBALL: 'dream-ball', BEASTBALL: 'beast-ball', CHERISHBALL: 'cherish-ball',

  POTION: 'potion', SUPERPOTION: 'super-potion', HYPERPOTION: 'hyper-potion', MAXPOTION: 'max-potion',
  FULLRESTORE: 'full-restore', REVIVE: 'revive', MAXREVIVE: 'max-revive',
  ANTIDOTE: 'antidote', PARALYZEHEAL: 'paralyze-heal', AWAKENING: 'awakening', BURNHEAL: 'burn-heal',
  ICEHEAL: 'ice-heal', FULLHEAL: 'full-heal',
  ETHER: 'ether', MAXETHER: 'max-ether', ELIXIR: 'elixir', MAXELIXIR: 'max-elixir',
  PPUP: 'pp-up', PPMAX: 'pp-max',
  LEMONADE: 'lemonade', FRESHWATER: 'fresh-water', SODAPOP: 'soda-pop', MOOMOOMILK: 'moomoo-milk',

  HPUP: 'hp-up', PROTEIN: 'protein', IRON: 'iron', CALCIUM: 'calcium', ZINC: 'zinc', CARBOS: 'carbos',
  RARECANDY: 'rare-candy',

  FIRESTONE: 'fire-stone', WATERSTONE: 'water-stone', THUNDERSTONE: 'thunder-stone', LEAFSTONE: 'leaf-stone',
  MOONSTONE: 'moon-stone', SUNSTONE: 'sun-stone', SHINYSTONE: 'shiny-stone', DUSKSTONE: 'dusk-stone',
  DAWNSTONE: 'dawn-stone', ICESTONE: 'ice-stone', OVALSTONE: 'oval-stone', EVERSTONE: 'everstone',

  REPEL: 'repel', SUPERREPEL: 'super-repel', MAXREPEL: 'max-repel',

  XATTACK: 'x-attack', XDEFENSE: 'x-defense', XSPEED: 'x-speed', XSPATK: 'x-sp-atk', XSPDEF: 'x-sp-def',
  XACCURACY: 'x-accuracy', DIREHIT: 'dire-hit', GUARDSPEC: 'guard-spec',

  ESCAPEROPE: 'escape-rope', SUPERREPELLENT: 'super-repel',
};

export function itemSpriteUrl(internalName) {
  const slug = internalName && ITEM_SLUGS[internalName];
  return slug ? `${SPRITE_BASE}/items/${slug}.png` : null;
}

/** Append a sprite <img> to `parent` if a URL resolves; hides itself on load failure. */
export function attachSprite(parent, url, alt, cls) {
  if (!url) return null;
  const img = document.createElement('img');
  img.className = cls;
  img.src = url;
  img.alt = alt || '';
  img.loading = 'lazy';
  img.onerror = () => img.remove();
  parent.append(img);
  return img;
}
