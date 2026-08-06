// Field labels for the classes a Pokemon Z save contains.
// The Pokemon and Trainer notes come from the game's own script comments
// (122_PokeBattle_Pokemon.rb, 112_PokeBattle_Trainer.rb).
//
// `kind` marks a field whose number should be resolved through a label table
// (see lib/labels.js) and offered as a dropdown in the UI.

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

export const CLASS_FIELDS = {
  PokeBattle_Trainer: {
    '@name': F('Name'),
    '@money': F('Money'),
    '@badges': F('Badges', { note: '8 booleans' }),
    '@party': F('Party'),
    '@pokedex': F('Pokedex obtained'),
    '@pokegear': F('Pokegear obtained'),
    '@trainertype': F('Trainer type', { kind: 'trainerTypes' }),
    '@outfit': F('Outfit'),
    '@language': F('Language'),
    '@id': F('Trainer ID', { note: '32-bit; secret ID is the high 16 bits' }),
    '@metaID': F('Meta ID'),
    '@expall': F('Exp. All active'),
    '@seen': F('Pokedex seen', { note: 'one flag per species' }),
    '@owned': F('Pokedex owned', { note: 'one flag per species' }),
    '@formseen': F('Forms seen'),
    '@formlastseen': F('Forms last seen'),
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
    '@happiness': F('Happiness'),
    '@status': F('Status condition', { note: '0 none, 1 sleep, 2 poison, 3 burn, 4 paralysis, 5 frozen' }),
    '@statusCount': F('Status counter'),
    '@eggsteps': F('Egg steps', { note: '0 means it is not an egg' }),
    '@ballused': F('Ball used'),
    '@markings': F('Markings'),
    '@pokerus': F('Pokerus'),
    '@personalID': F('Personal ID'),
    '@trainerID': F('Trainer ID'),
    '@ot': F('Original Trainer'),
    '@otgender': F('OT gender', { note: '0 male, 1 female, 2 mixed, 3 unknown' }),
    '@obtainMode': F('Obtain method', { note: '0 met, 1 egg, 2 traded, 4 fateful encounter' }),
    '@obtainMap': F('Obtained on map', { kind: 'maps' }),
    '@obtainText': F('Obtain text override'),
    '@obtainLevel': F('Obtained at level'),
    '@hatchedMap': F('Hatched on map', { kind: 'maps' }),
    '@language': F('Language'),
    '@abilityflag': F('Forced ability', { note: '0 first, 1 second, 2 hidden' }),
    '@genderflag': F('Forced gender', { note: '0 male, 1 female' }),
    '@natureflag': F('Forced nature'),
    '@shinyflag': F('Forced shiny'),
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
    '@direction': F('Facing', { note: '2 down, 4 left, 6 right, 8 up' }),
  },

  Game_Variables: { '@data': F('Values, indexed by variable number') },
  Game_Switches: { '@data': F('Values, indexed by switch number') },
};

/** Label + hints for one ivar of one class. */
export function fieldInfo(cls, name) {
  const f = CLASS_FIELDS[cls] && CLASS_FIELDS[cls][name];
  return f || { label: name.replace(/^@/, '') };
}
