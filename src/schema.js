// Field labels for the classes a Pokemon Z save contains.
// The Pokemon and Trainer notes, and every fixed set of numbers below, come
// from the game's own scripts (122_PokeBattle_Pokemon.rb, 112_PokeBattle_Trainer.rb,
// 065_PBStatuses.rb, 100_PField_Metadata.rb, 143_PScreen_Options.rb) - not guessed.
//
// `kind` marks a field whose number should be resolved through a label table
// (see lib/labels.js) and offered as a searchable combo box in the UI.
// `options` marks a field that only ever holds one of a small fixed set of
// values, offered as a dropdown. `mask` marks a single integer that packs
// several yes/no flags into bits, offered as a row of checkboxes.

/** The 15 Marshal streams a save is made of, in pbSave() order. */
export const SECTIONS = [
  { key: 'trainer', name: '$Trainer', cls: 'PokeBattle_Trainer', desc: 'Name, money, badges, Pokedex, party' },
  { key: 'frame_count', name: 'Graphics.frame_count', cls: 'Fixnum', desc: 'Play time, in frames (40 per second)' },
  { key: 'game_system', name: '$game_system', cls: 'Game_System', desc: 'Save count, magic number, BGM state' },
  { key: 'pokemon_system', name: '$PokemonSystem', cls: 'PokemonSystem', desc: 'Options: text speed, battle style, volume' },
  { key: 'map_id', name: '$game_map.map_id', cls: 'Fixnum', desc: 'Map the player is standing on' },
  { key: 'switches', name: '$game_switches', cls: 'Game_Switches', desc: 'Every game switch' },
  { key: 'variables', name: '$game_variables', cls: 'Game_Variables', desc: 'Every game variable (99 is the save slot)' },
  { key: 'self_switches', name: '$game_self_switches', cls: 'Game_SelfSwitches', desc: 'Per-event A/B/C/D switches' },
  { key: 'screen', name: '$game_screen', cls: 'Game_Screen', desc: 'Tone, flash, weather, pictures' },
  { key: 'map_factory', name: '$MapFactory', cls: 'PokemonMapFactory', desc: 'Loaded maps and events (the largest section)' },
  { key: 'player', name: '$game_player', cls: 'Game_Player', desc: 'Player position and movement state' },
  { key: 'pokemon_global', name: '$PokemonGlobal', cls: 'PokemonGlobalMetadata', desc: 'Bike, surf, repel, phone, day care' },
  { key: 'pokemon_map', name: '$PokemonMap', cls: 'PokemonMapMetadata', desc: 'Per-map metadata' },
  { key: 'bag', name: '$PokemonBag', cls: 'PokemonBag', desc: 'Items, by pocket' },
  { key: 'storage', name: '$PokemonStorage', cls: 'PokemonStorage', desc: 'Boxes' },
];

const F = (label, extra = {}) => ({ label, ...extra });
const OPT = (pairs) => pairs.map(([value, label]) => ({ value, label }));

/** The 25 natures, in Essentials' PBNatures order (index = @natureflag value). */
export const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile',
  'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy',
  'Careful', 'Quirky'];

const NATURAL = { value: null, label: 'Natural (from Personal ID)' };
const NATURE_OPTIONS = [NATURAL, ...NATURES.map((n, i) => ({ value: i, label: `${i} - ${n}` }))];

export const CLASS_FIELDS = {
  PokeBattle_Trainer: {
    '@name': F('Name'),
    '@money': F('Money', { note: 'very large values may not display correctly on the in-game money HUD, which has limited digits' }),
    '@badges': F('Badges', { note: '8 booleans' }),
    '@party': F('Party'),
    '@pokedex': F('Pokedex obtained'),
    '@pokegear': F('Pokegear obtained'),
    '@trainertype': F('Trainer type', { kind: 'trainerTypes' }),
    '@outfit': F('Outfit', { note: 'costume/appearance index; the game itself changes this at certain story switches' }),
    '@language': F('Language'),
    '@id': F('Trainer ID', { note: '32-bit; secret ID is the high 16 bits' }),
    '@metaID': F('Meta ID'),
    '@expall': F('Exp. All active', { note: 'boolean' }),
    '@seen': F('Pokedex seen', { note: 'one flag per species' }),
    '@owned': F('Pokedex owned', { note: 'one flag per species' }),
    '@formseen': F('Forms seen', { note: 'bitmask per species: which alternate forms (regional, seasonal, ...) have been seen in the Pokédex' }),
    '@formlastseen': F('Forms last seen', { note: 'the form index shown by default in the Pokédex entry for each species' }),
    '@shadowcaught': F('Shadow Pokemon caught'),
  },

  PokeBattle_Pokemon: {
    '@species': F('Species', { kind: 'species' }),
    '@name': F('Nickname'),
    '@exp': F('Experience'),
    '@hp': F('Current HP'),
    '@totalhp': F('Total HP', { readonly: true, note: 'recalculated by the game' }),
    '@attack': F('Attack', { readonly: true }),
    '@defense': F('Defense', { readonly: true }),
    '@speed': F('Speed', { readonly: true }),
    '@spatk': F('Sp. Attack', { readonly: true }),
    '@spdef': F('Sp. Defense', { readonly: true }),
    '@iv': F('IVs', { note: 'HP, Atk, Def, Spd, SpAtk, SpDef' }),
    '@ev': F('EVs', { note: 'max 510 total, 252 per stat' }),
    '@item': F('Held item', { kind: 'items' }),
    '@moves': F('Moves'),
    '@firstmoves': F('Moves known when caught', { kind: 'moves' }),
    '@happiness': F('Happiness', { range: [0, 255], note: 'friendship, 0-255; drives evolution and some move power' }),
    '@status': F('Status condition', {
      options: OPT([
        [0, '0 - Healthy'], [1, '1 - Asleep'], [2, '2 - Poisoned'], [3, '3 - Burned'],
        [4, '4 - Paralyzed'], [5, '5 - Frozen'], [6, '6 - Caduco (custom status)'],
        [7, '7 - Bleeding (custom status)'],
      ]),
    }),
    '@statusCount': F('Status counter', { note: 'sleep: turns left; poison/burn/paralysis/frozen: usually 0' }),
    '@eggsteps': F('Egg steps', { note: '0 means it is not an egg' }),
    '@ballused': F('Ball used', { kind: 'items', note: 'item id of the Poké Ball it was caught in' }),
    '@markings': F('Markings', {
      mask: [{ bit: 0, label: '●' }, { bit: 1, label: '■' }, { bit: 2, label: '▲' }, { bit: 3, label: '♥' }],
    }),
    '@pokerus': F('Pokerus'),
    '@personalID': F('Personal ID'),
    '@trainerID': F('Trainer ID'),
    '@ot': F('Original Trainer'),
    '@otgender': F('OT gender', { options: OPT([[0, '0 - Male'], [1, '1 - Female'], [2, '2 - Mixed/Unknown']]) }),
    '@obtainMode': F('Obtain method', {
      options: OPT([
        [0, '0 - Met (wild encounter)'], [1, '1 - Hatched from an egg'],
        [2, '2 - Traded'], [4, '4 - Fateful encounter (Mystery Gift)'],
      ]),
    }),
    '@obtainMap': F('Obtained on map', { kind: 'maps' }),
    '@obtainText': F('Obtain text override'),
    '@obtainLevel': F('Obtained at level', { range: [1, 100] }),
    '@hatchedMap': F('Hatched on map', { kind: 'maps' }),
    '@language': F('Language'),
    '@abilityflag': F('Forced ability', {
      options: [NATURAL, { value: 0, label: '0 - First ability' }, { value: 1, label: '1 - Second ability' }, { value: 2, label: '2 - Hidden ability' }],
    }),
    '@genderflag': F('Forced gender', {
      options: [NATURAL, { value: 0, label: '0 - Male' }, { value: 1, label: '1 - Female' }],
    }),
    '@natureflag': F('Forced nature', {
      options: NATURE_OPTIONS,
      note: "overrides the nature normally derived from the Pokemon's Personal ID (@personalID % 25)",
    }),
    '@shinyflag': F('Forced shiny', {
      options: [NATURAL, { value: true, label: 'Force shiny' }, { value: false, label: 'Force not shiny' }],
    }),
    '@ribbons': F('Ribbons'),
    '@expshare': F('Exp. Share'),
    '@fused': F('Fused Pokemon'),
    '@mail': F('Mail'),
    '@cool': F('Contest: cool'),
    '@beauty': F('Contest: beauty'),
    '@cute': F('Contest: cute'),
    '@smart': F('Contest: smart'),
    '@tough': F('Contest: tough'),
    '@sheen': F('Contest: sheen'),
  },

  PBMove: {
    '@id': F('Move', { kind: 'moves' }),
    '@pp': F('Current PP'),
    '@ppup': F('PP Ups used'),
  },

  PokemonBag: {
    '@pockets': F('Pockets', { note: 'each entry is [item id, quantity]' }),
    '@lastpocket': F('Last pocket viewed'),
    '@choices': F('Cursor position per pocket'),
    '@registeredItem': F('Registered item', { kind: 'items' }),
    '@registered_items': F('Registered items', { kind: 'items' }),
    '@ready_menu_selection': F('Ready menu selection'),
  },

  PokemonStorage: {
    '@boxes': F('Boxes'),
    '@currentBox': F('Current box'),
    '@boxmode': F('Box mode'),
  },

  PokemonBox: {
    '@pokemon': F('Pokemon in this box'),
    '@name': F('Box name'),
    '@background': F('Box wallpaper'),
  },

  Game_System: {
    '@save_count': F('Times saved'),
    '@magic_number': F('Magic number', { note: 'must match Data/System.rxdata or the save is refused' }),
    '@playing_bgm': F('Playing BGM'),
    '@playing_bgs': F('Playing BGS'),
  },

  Game_Player: {
    '@x': F('Map X'),
    '@y': F('Map Y'),
    '@real_x': F('Pixel X'),
    '@real_y': F('Pixel Y'),
    '@direction': F('Facing', { options: OPT([[2, '2 - Down'], [4, '4 - Left'], [6, '6 - Right'], [8, '8 - Up']]) }),
  },

  Game_Variables: { '@data': F('Values, indexed by variable number') },
  Game_Switches: { '@data': F('Values, indexed by switch number') },

  // Options screen. Numbers come from PokemonSystem's own initialize() and
  // the menu definitions in 143_PScreen_Options.rb.
  PokemonSystem: {
    '@textspeed': F('Text speed', { options: OPT([[0, '0 - Slow'], [1, '1 - Normal'], [2, '2 - Fast']]) }),
    '@battlescene': F('Battle animations', { options: OPT([[0, '0 - On'], [1, '1 - Off']]) }),
    '@battlestyle': F('Battle style', { options: OPT([[0, '0 - Switch'], [1, '1 - Set']]) }),
    '@screensize': F('Window size', { options: OPT([[0, '0 - Half'], [1, '1 - Full'], [2, '2 - Double']]) }),
    '@language': F('Text language', { note: 'index into the game\'s language list' }),
    '@difficulty': F('Difficulty'),
    '@bgmvolume': F('Music volume', { note: '0-100' }),
    '@sevolume': F('Sound effect volume', { note: '0-100' }),
    '@vsync': F('VSync', { note: 'boolean' }),
    '@runstyle': F('Run style'),
    '@textskin': F('Text box skin'),
    '@frame': F('Window frame skin'),
    '@font': F('Font'),
    '@border': F('Screen border'),
    '@sprtanime': F('Sprite animation'),
    '@hide_turbo_icon': F('Hide fast-forward icon', { note: 'boolean' }),
  },

  // Field state, day care, Pokedex viewing state and other cross-map globals.
  // Names come from PokemonGlobalMetadata's attr_accessor list in
  // 100_PField_Metadata.rb; only the non-obvious/bounded ones get a note.
  PokemonGlobalMetadata: {
    '@bicycle': F('Riding the bicycle', { note: 'boolean' }),
    '@surfing': F('Surfing', { note: 'boolean' }),
    '@diving': F('Diving', { note: 'boolean' }),
    '@sliding': F('Sliding (ice/mud)', { note: 'boolean' }),
    '@fishing': F('Fishing', { note: 'boolean' }),
    '@runtoggle': F('Always-run toggle', { note: 'boolean' }),
    '@repel': F('Repel steps remaining'),
    '@amuleto': F('Amulet Coin active', { note: 'boolean' }),
    '@shinyzador': F('Shiny-boost effect active', { note: 'boolean' }),
    '@flashUsed': F('Flash used in the current cave', { note: 'boolean' }),
    '@bridge': F('Standing on a bridge', { note: 'boolean' }),
    '@runningShoes': F('Has Running Shoes', { note: 'boolean' }),
    '@snagMachine': F('Has the Snag Machine', { note: 'boolean' }),
    '@seenStorageCreator': F('Met Bill/the box system', { note: 'boolean' }),
    '@coins': F('Game Corner coins'),
    '@sootsack': F('Has the Soot Sack', { note: 'boolean' }),
    '@stepcount': F('Steps taken', { note: 'drives hatching, the Pokéradar chain, etc.' }),
    '@happinessSteps': F('Steps until the next happiness/friendship tick'),
    '@pokerusTime': F('Pokérus real-time timer'),
    '@daycare': F('Day Care contents'),
    '@daycareEgg': F('Day Care egg is ready', { note: 'boolean' }),
    '@daycareEggSteps': F('Steps until the Day Care egg is ready'),
    '@pokedexUnlocked': F('Unlocked Pokédex(es)'),
    '@pokedexDex': F('Pokédex currently open', { note: '-1 is the National Dex' }),
    '@pokedexIndex': F('Last species viewed, per Dex'),
    '@pokedexMode': F('Pokédex search mode'),
    '@healingSpot': F('Respawn point', { note: 'map/position the player wakes up at after fainting' }),
    '@escapePoint': F('Dig/Escape Rope return point'),
    '@pokecenterMapId': F('Respawn map', { kind: 'maps' }),
    '@visitedMaps': F('Maps visited', { note: 'drives the Town Map / fly destinations' }),
    '@safariState': F('Safari Zone state'),
    '@bugContestState': F('Bug Catching Contest state'),
    '@phoneNumbers': F('Registered phone contacts'),
    '@phoneTime': F('Phone call cooldown timer'),
    '@safesave': F('Safe to save', { note: 'boolean; the game sets this once it has confirmed the current map is a valid save location' }),
  },
};

/** Label + hints for one ivar of one class. */
export function fieldInfo(cls, name) {
  const f = CLASS_FIELDS[cls] && CLASS_FIELDS[cls][name];
  return f || { label: name.replace(/^@/, '') };
}
