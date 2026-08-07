// Field labels for the classes a Pokemon Z save contains.
// The Pokemon and Trainer notes, and every fixed set of numbers below, come
// from the game's own scripts (122_PokeBattle_Pokemon.rb, 112_PokeBattle_Trainer.rb,
// 065_PBStatuses.rb, 100_PField_Metadata.rb, 143_PScreen_Options.rb) - not guessed.
//
// Every human-facing string here is an L(en, es) pair, resolved by pick() on the
// read side (src/views.js and children() in src/save.js) so the tabs never have
// to know about the language.
//
// `kind` marks a field whose number should be resolved through a label table
// (see lib/labels.js) and offered as a searchable combo box in the UI.
// `options` marks a field that only ever holds one of a small fixed set of
// values, offered as a dropdown. `mask` marks a single integer that packs
// several yes/no flags into bits, offered as a row of checkboxes.

import { pick } from './i18n.js';

/** One human-facing string in both languages. */
const L = (en, es) => ({ en, es });

/** The 15 Marshal streams a save is made of, in pbSave() order. */
export const SECTIONS = [
  { key: 'trainer', name: '$Trainer', cls: 'PokeBattle_Trainer', desc: L('Name, money, badges, Pokedex, party', 'Nombre, dinero, medallas, Pokédex y equipo') },
  { key: 'frame_count', name: 'Graphics.frame_count', cls: 'Fixnum', desc: L('Play time, in frames (40 per second)', 'Tiempo jugado, en fotogramas (40 por segundo)') },
  { key: 'game_system', name: '$game_system', cls: 'Game_System', desc: L('Save count, magic number, BGM state', 'Veces guardado, número mágico y estado de la música') },
  { key: 'pokemon_system', name: '$PokemonSystem', cls: 'PokemonSystem', desc: L('Options: text speed, battle style, volume', 'Opciones: velocidad del texto, estilo de combate y volumen') },
  { key: 'map_id', name: '$game_map.map_id', cls: 'Fixnum', desc: L('Map the player is standing on', 'Mapa en el que está el jugador') },
  { key: 'switches', name: '$game_switches', cls: 'Game_Switches', desc: L('Every game switch', 'Todos los interruptores del juego') },
  { key: 'variables', name: '$game_variables', cls: 'Game_Variables', desc: L('Every game variable (99 is the save slot)', 'Todas las variables del juego (la 99 es la ranura de guardado)') },
  { key: 'self_switches', name: '$game_self_switches', cls: 'Game_SelfSwitches', desc: L('Per-event A/B/C/D switches', 'Interruptores A/B/C/D de cada evento') },
  { key: 'screen', name: '$game_screen', cls: 'Game_Screen', desc: L('Tone, flash, weather, pictures', 'Tono, destellos, clima e imágenes') },
  { key: 'map_factory', name: '$MapFactory', cls: 'PokemonMapFactory', desc: L('Loaded maps and events (the largest section)', 'Mapas y eventos cargados (la sección más grande)') },
  { key: 'player', name: '$game_player', cls: 'Game_Player', desc: L('Player position and movement state', 'Posición y estado de movimiento del jugador') },
  { key: 'pokemon_global', name: '$PokemonGlobal', cls: 'PokemonGlobalMetadata', desc: L('Bike, surf, repel, phone, day care', 'Bici, surf, repelente, teléfono y guardería') },
  { key: 'pokemon_map', name: '$PokemonMap', cls: 'PokemonMapMetadata', desc: L('Per-map metadata', 'Metadatos de cada mapa') },
  { key: 'bag', name: '$PokemonBag', cls: 'PokemonBag', desc: L('Items, by pocket', 'Objetos, por bolsillo') },
  { key: 'storage', name: '$PokemonStorage', cls: 'PokemonStorage', desc: L('Boxes', 'Cajas') },
];

const F = (label, extra = {}) => ({ label, ...extra });
const OPT = (pairs) => pairs.map(([value, label]) => ({ value, label }));

/**
 * The 25 natures, in Essentials' PBNatures order (index = @natureflag value).
 * The Spanish column is the one the games themselves use.
 */
export const NATURES = {
  en: ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile',
    'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
    'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy',
    'Careful', 'Quirky'],
  es: ['Fuerte', 'Huraño', 'Audaz', 'Firme', 'Pícaro', 'Osado', 'Dócil',
    'Plácido', 'Agitado', 'Flojo', 'Miedoso', 'Activo', 'Serio', 'Alegre', 'Ingenuo',
    'Modesto', 'Afable', 'Manso', 'Tímido', 'Alocado', 'Calmado', 'Amable', 'Grosero',
    'Cauto', 'Raro'],
};

/** The nature names in the language currently selected. */
export const natureList = () => pick(NATURES);

const NATURAL = { value: null, label: L('Natural (from Personal ID)', 'Natural (según el ID personal)') };
const NATURE_OPTIONS = [NATURAL, ...NATURES.en.map((n, i) => ({
  value: i,
  label: L(`${i} - ${n}`, `${i} - ${NATURES.es[i]}`),
}))];

export const CLASS_FIELDS = {
  PokeBattle_Trainer: {
    '@name': F(L('Name', 'Nombre')),
    '@money': F(L('Money', 'Dinero'), {
      note: L('very large values may not display correctly on the in-game money HUD, which has limited digits',
        'los valores muy grandes puede que no se vean bien en el marcador de dinero del juego, que tiene pocos dígitos'),
    }),
    '@badges': F(L('Badges', 'Medallas'), { note: L('8 booleans', '8 booleanos') }),
    '@party': F(L('Party', 'Equipo')),
    '@pokedex': F(L('Pokedex obtained', 'Pokédex conseguida')),
    '@pokegear': F(L('Pokegear obtained', 'Pokégear conseguido')),
    '@trainertype': F(L('Trainer type', 'Tipo de entrenador'), { kind: 'trainerTypes' }),
    '@outfit': F(L('Outfit', 'Atuendo'), {
      note: L('costume/appearance index; the game itself changes this at certain story switches',
        'índice de aspecto; el propio juego lo cambia en ciertos momentos de la historia'),
    }),
    '@language': F(L('Language', 'Idioma')),
    '@id': F(L('Trainer ID', 'ID de entrenador'), {
      note: L('32-bit; secret ID is the high 16 bits', '32 bits; el ID secreto son los 16 bits altos'),
    }),
    '@gender': F(L('Gender', 'Sexo'), { options: OPT([[0, L('0 - Male', '0 - Chico')], [1, L('1 - Female', '1 - Chica')]]) }),
    '@metaID': F(L('Meta ID', 'ID de metadatos')),
    '@expall': F(L('Exp. All active', 'Repartir Exp. activo'), { note: L('boolean', 'booleano') }),
    '@seen': F(L('Pokedex seen', 'Pokédex: vistos'), { note: L('one flag per species', 'un indicador por especie') }),
    '@owned': F(L('Pokedex owned', 'Pokédex: capturados'), { note: L('one flag per species', 'un indicador por especie') }),
    '@formseen': F(L('Forms seen', 'Formas vistas'), {
      note: L('bitmask per species: which alternate forms (regional, seasonal, ...) have been seen in the Pokédex',
        'máscara de bits por especie: qué formas alternativas (regionales, estacionales…) se han visto en la Pokédex'),
    }),
    '@formlastseen': F(L('Forms last seen', 'Última forma vista'), {
      note: L('the form index shown by default in the Pokédex entry for each species',
        'el índice de forma que la Pokédex muestra por defecto en la ficha de cada especie'),
    }),
    '@shadowcaught': F(L('Shadow Pokemon caught', 'Pokémon Oscuros capturados')),
  },

  PokeBattle_Pokemon: {
    '@species': F(L('Species', 'Especie'), { kind: 'species' }),
    '@name': F(L('Nickname', 'Mote')),
    '@exp': F(L('Experience', 'Experiencia')),
    '@hp': F(L('Current HP', 'PS actuales')),
    '@totalhp': F(L('Total HP', 'PS máximos'), { readonly: true, note: L('recalculated by the game', 'el juego lo recalcula') }),
    '@attack': F(L('Attack', 'Ataque'), { readonly: true }),
    '@defense': F(L('Defense', 'Defensa'), { readonly: true }),
    '@speed': F(L('Speed', 'Velocidad'), { readonly: true }),
    '@spatk': F(L('Sp. Attack', 'Ataque Especial'), { readonly: true }),
    '@spdef': F(L('Sp. Defense', 'Defensa Especial'), { readonly: true }),
    '@iv': F(L('IVs', 'IVs'), { note: L('HP, Atk, Def, Spd, SpAtk, SpDef', 'PS, Atq, Def, Vel, AtEsp, DefEsp') }),
    '@ev': F(L('EVs', 'EVs'), { note: L('max 510 total, 252 per stat', 'máx. 510 en total, 252 por estadística') }),
    '@item': F(L('Held item', 'Objeto equipado'), { kind: 'items' }),
    '@moves': F(L('Moves', 'Movimientos')),
    '@firstmoves': F(L('Moves known when caught', 'Movimientos al ser capturado'), { kind: 'moves' }),
    '@happiness': F(L('Happiness', 'Felicidad'), {
      range: [0, 255],
      note: L('friendship, 0-255; drives evolution and some move power',
        'amistad, 0-255; afecta a algunas evoluciones y a la potencia de algunos movimientos'),
    }),
    '@status': F(L('Status condition', 'Estado'), {
      options: OPT([
        [0, L('0 - Healthy', '0 - Sano')], [1, L('1 - Asleep', '1 - Dormido')],
        [2, L('2 - Poisoned', '2 - Envenenado')], [3, L('3 - Burned', '3 - Quemado')],
        [4, L('4 - Paralyzed', '4 - Paralizado')], [5, L('5 - Frozen', '5 - Congelado')],
        [6, L('6 - Caduco (custom status)', '6 - Caduco (estado propio)')],
        [7, L('7 - Bleeding (custom status)', '7 - Sangrando (estado propio)')],
      ]),
    }),
    '@statusCount': F(L('Status counter', 'Contador de estado'), {
      note: L('sleep: turns left; poison/burn/paralysis/frozen: usually 0',
        'dormido: turnos que quedan; veneno/quemadura/parálisis/congelación: normalmente 0'),
    }),
    '@eggsteps': F(L('Egg steps', 'Pasos de huevo'), {
      note: L('0 means it is not an egg. Pokémon created in this editor as an egg get the species\' real hatch-cycle count.',
        '0 significa que no es un huevo. Los Pokémon creados como huevo en este editor reciben los ciclos de eclosión reales de su especie.'),
    }),
    '@ballused': F(L('Ball used', 'Ball usada'), {
      kind: 'items',
      note: L('item id of the Poké Ball it was caught in', 'id del objeto de la Poké Ball con la que se capturó'),
    }),
    '@markings': F(L('Markings', 'Marcas'), {
      mask: [{ bit: 0, label: '●' }, { bit: 1, label: '■' }, { bit: 2, label: '▲' }, { bit: 3, label: '♥' }],
    }),
    '@pokerus': F(L('Pokerus', 'Pokerus')),
    '@personalID': F(L('Personal ID', 'ID personal')),
    '@trainerID': F(L('Trainer ID', 'ID de entrenador')),
    '@ot': F(L('Original Trainer', 'Entrenador original')),
    '@otgender': F(L('OT gender', 'Sexo del entrenador original'), {
      options: OPT([
        [0, L('0 - Male', '0 - Chico')], [1, L('1 - Female', '1 - Chica')],
        [2, L('2 - Mixed/Unknown', '2 - Mixto o desconocido')],
      ]),
    }),
    '@obtainMode': F(L('Obtain method', 'Cómo se obtuvo'), {
      options: OPT([
        [0, L('0 - Met (wild encounter)', '0 - Encontrado (en estado salvaje)')],
        [1, L('1 - Hatched from an egg', '1 - Nacido de un huevo')],
        [2, L('2 - Traded', '2 - Intercambiado')],
        [4, L('4 - Fateful encounter (Mystery Gift)', '4 - Encuentro especial (Regalo Misterioso)')],
      ]),
    }),
    '@obtainMap': F(L('Obtained on map', 'Mapa donde se obtuvo'), { kind: 'maps' }),
    '@obtainText': F(L('Obtain text override', 'Texto de obtención personalizado')),
    '@obtainLevel': F(L('Obtained at level', 'Nivel al obtenerlo'), { range: [1, 100] }),
    '@hatchedMap': F(L('Hatched on map', 'Mapa donde eclosionó'), { kind: 'maps' }),
    '@language': F(L('Language', 'Idioma')),
    '@abilityflag': F(L('Forced ability', 'Habilidad forzada'), {
      options: [NATURAL,
        { value: 0, label: L('0 - First ability', '0 - Primera habilidad') },
        { value: 1, label: L('1 - Second ability', '1 - Segunda habilidad') },
        { value: 2, label: L('2 - Hidden ability', '2 - Habilidad oculta') }],
    }),
    '@genderflag': F(L('Forced gender', 'Sexo forzado'), {
      options: [NATURAL,
        { value: 0, label: L('0 - Male', '0 - Macho') },
        { value: 1, label: L('1 - Female', '1 - Hembra') }],
    }),
    '@natureflag': F(L('Forced nature', 'Naturaleza forzada'), {
      options: NATURE_OPTIONS,
      note: L("overrides the nature normally derived from the Pokemon's Personal ID (@personalID % 25)",
        'sustituye a la naturaleza que normalmente se deduce del ID personal (@personalID % 25)'),
    }),
    '@shinyflag': F(L('Forced shiny', 'Variocolor forzado'), {
      options: [NATURAL,
        { value: true, label: L('Force shiny', 'Forzar variocolor') },
        { value: false, label: L('Force not shiny', 'Forzar que no sea variocolor') }],
    }),
    '@ribbons': F(L('Ribbons', 'Cintas'), { note: L('array of ribbon ids', 'lista de ids de cintas') }),
    '@expshare': F(L('Exp. Share', 'Repartir Exp.')),
    '@fused': F(L('Fused Pokemon', 'Pokémon fusionado')),
    '@mail': F(L('Mail', 'Carta')),
    '@cool': F(L('Contest: cool', 'Concurso: carisma')),
    '@beauty': F(L('Contest: beauty', 'Concurso: belleza')),
    '@cute': F(L('Contest: cute', 'Concurso: dulzura')),
    '@smart': F(L('Contest: smart', 'Concurso: ingenio')),
    '@tough': F(L('Contest: tough', 'Concurso: dureza')),
    '@sheen': F(L('Contest: sheen', 'Concurso: brillo')),
  },

  PBMove: {
    '@id': F(L('Move', 'Movimiento'), { kind: 'moves' }),
    '@pp': F(L('Current PP', 'PP actuales')),
    '@ppup': F(L('PP Ups used', 'Más PP usados')),
  },

  PokemonBag: {
    '@pockets': F(L('Pockets', 'Bolsillos'), {
      note: L('each entry is [item id, quantity]', 'cada entrada es [id del objeto, cantidad]'),
    }),
    '@lastpocket': F(L('Last pocket viewed', 'Último bolsillo abierto')),
    '@choices': F(L('Cursor position per pocket', 'Posición del cursor en cada bolsillo')),
    '@registeredItem': F(L('Registered item', 'Objeto registrado'), { kind: 'items' }),
    '@registered_items': F(L('Registered items', 'Objetos registrados'), { kind: 'items' }),
    '@ready_menu_selection': F(L('Ready menu selection', 'Selección del menú rápido')),
  },

  PokemonStorage: {
    '@boxes': F(L('Boxes', 'Cajas')),
    '@currentBox': F(L('Current box', 'Caja actual')),
    '@boxmode': F(L('Box mode', 'Modo de caja')),
  },

  PokemonBox: {
    '@pokemon': F(L('Pokemon in this box', 'Pokémon de esta caja')),
    '@name': F(L('Box name', 'Nombre de la caja')),
    '@background': F(L('Box wallpaper', 'Fondo de la caja')),
  },

  Game_System: {
    '@save_count': F(L('Times saved', 'Veces guardado')),
    '@magic_number': F(L('Magic number', 'Número mágico'), {
      note: L('must match Data/System.rxdata or the save is refused',
        'debe coincidir con Data/System.rxdata o el juego rechaza la partida'),
    }),
    '@playing_bgm': F(L('Playing BGM', 'Música sonando')),
    '@playing_bgs': F(L('Playing BGS', 'Sonido ambiente sonando')),
  },

  Game_Player: {
    '@x': F(L('Map X', 'X del mapa')),
    '@y': F(L('Map Y', 'Y del mapa')),
    '@real_x': F(L('Pixel X', 'X en píxeles')),
    '@real_y': F(L('Pixel Y', 'Y en píxeles')),
    '@direction': F(L('Facing', 'Orientación'), {
      options: OPT([
        [2, L('2 - Down', '2 - Abajo')], [4, L('4 - Left', '4 - Izquierda')],
        [6, L('6 - Right', '6 - Derecha')], [8, L('8 - Up', '8 - Arriba')],
      ]),
    }),
  },

  Game_Variables: { '@data': F(L('Values, indexed by variable number', 'Valores, indexados por número de variable')) },
  Game_Switches: { '@data': F(L('Values, indexed by switch number', 'Valores, indexados por número de interruptor')) },

  // Options screen. Numbers come from PokemonSystem's own initialize() and
  // the menu definitions in 143_PScreen_Options.rb.
  PokemonSystem: {
    '@textspeed': F(L('Text speed', 'Velocidad del texto'), {
      options: OPT([[0, L('0 - Slow', '0 - Lenta')], [1, L('1 - Normal', '1 - Normal')], [2, L('2 - Fast', '2 - Rápida')]]),
    }),
    '@battlescene': F(L('Battle animations', 'Animaciones de combate'), {
      options: OPT([[0, L('0 - On', '0 - Sí')], [1, L('1 - Off', '1 - No')]]),
    }),
    '@battlestyle': F(L('Battle style', 'Estilo de combate'), {
      options: OPT([[0, L('0 - Switch', '0 - Cambio')], [1, L('1 - Set', '1 - Fijo')]]),
    }),
    '@screensize': F(L('Window size', 'Tamaño de ventana'), {
      options: OPT([[0, L('0 - Half', '0 - Mitad')], [1, L('1 - Full', '1 - Normal')], [2, L('2 - Double', '2 - Doble')]]),
    }),
    '@language': F(L('Text language', 'Idioma del texto'), {
      note: L('index into the game\'s language list', 'índice en la lista de idiomas del juego'),
    }),
    '@difficulty': F(L('Difficulty', 'Dificultad')),
    '@bgmvolume': F(L('Music volume', 'Volumen de la música'), { note: L('0-100', '0-100') }),
    '@sevolume': F(L('Sound effect volume', 'Volumen de los efectos'), { note: L('0-100', '0-100') }),
    '@vsync': F(L('VSync', 'Sincronía vertical'), { note: L('boolean', 'booleano') }),
    '@runstyle': F(L('Run style', 'Forma de correr')),
    '@textskin': F(L('Text box skin', 'Aspecto de los cuadros de texto')),
    '@frame': F(L('Window frame skin', 'Aspecto del marco de ventana')),
    '@font': F(L('Font', 'Fuente')),
    '@border': F(L('Screen border', 'Borde de pantalla')),
    '@sprtanime': F(L('Sprite animation', 'Animación de sprites')),
    '@hide_turbo_icon': F(L('Hide fast-forward icon', 'Ocultar el icono de avance rápido'), { note: L('boolean', 'booleano') }),
  },

  // Field state, day care, Pokedex viewing state and other cross-map globals.
  // Names come from PokemonGlobalMetadata's attr_accessor list in
  // 100_PField_Metadata.rb; only the non-obvious/bounded ones get a note.
  PokemonGlobalMetadata: {
    '@bicycle': F(L('Riding the bicycle', 'Montado en la bici'), { note: L('boolean', 'booleano') }),
    '@surfing': F(L('Surfing', 'Surfeando'), { note: L('boolean', 'booleano') }),
    '@diving': F(L('Diving', 'Buceando'), { note: L('boolean', 'booleano') }),
    '@sliding': F(L('Sliding (ice/mud)', 'Deslizándose (hielo o barro)'), { note: L('boolean', 'booleano') }),
    '@fishing': F(L('Fishing', 'Pescando'), { note: L('boolean', 'booleano') }),
    '@runtoggle': F(L('Always-run toggle', 'Correr siempre'), { note: L('boolean', 'booleano') }),
    '@repel': F(L('Repel steps remaining', 'Pasos de Repelente restantes')),
    // Not the Amulet Coin: this is the step budget shared by the eighteen type
    // Amulets (switches 280-297). pbAmuleto sets it, every step off ice takes
    // one off it, and at zero all eighteen switches clear together - so a
    // counter above zero with every switch off just ticks down doing nothing.
    // See the "Type amulets" card on the Game state tab.
    '@amuleto': F(L('Type Amulet steps remaining', 'Pasos restantes de los Amuletos de tipo'), {
      note: L('shared by switches 280-297 — at 0 they all switch off',
        'los comparten los interruptores 280-297: al llegar a 0 se apagan todos'),
    }),
    // Declared and zeroed in 100_PField_Metadata.rb and never read again; the
    // Shinyzador works through switch 457 instead.
    '@shinyzador': F(L('Shinyzador counter (unused)', 'Contador del Shinyzador (sin uso)'), {
      note: L('nothing reads it — the shiny effect is switch 457',
        'no lo lee nada: el efecto variocolor es el interruptor 457'),
    }),
    '@flashUsed': F(L('Flash used in the current cave', 'Destello usado en la cueva actual'), { note: L('boolean', 'booleano') }),
    '@bridge': F(L('Standing on a bridge', 'Sobre un puente'), { note: L('boolean', 'booleano') }),
    '@runningShoes': F(L('Has Running Shoes', 'Tiene las Zapatillas de Correr'), { note: L('boolean', 'booleano') }),
    '@snagMachine': F(L('Has the Snag Machine', 'Tiene la Máquina Captura'), { note: L('boolean', 'booleano') }),
    '@seenStorageCreator': F(L('Met Bill/the box system', 'Ha conocido el sistema de cajas'), { note: L('boolean', 'booleano') }),
    '@coins': F(L('Game Corner coins', 'Fichas del Casino')),
    '@sootsack': F(L('Has the Soot Sack', 'Tiene el Saco Ceniza'), { note: L('boolean', 'booleano') }),
    '@stepcount': F(L('Steps taken', 'Pasos dados'), {
      note: L('drives hatching, the Pokéradar chain, etc.', 'afecta a la eclosión de huevos, a la cadena del Pokéradar, etc.'),
    }),
    '@happinessSteps': F(L('Steps until the next happiness/friendship tick', 'Pasos hasta la próxima subida de felicidad')),
    '@pokerusTime': F(L('Pokérus real-time timer', 'Temporizador real del Pokérus')),
    '@daycare': F(L('Day Care contents', 'Contenido de la Guardería')),
    '@daycareEgg': F(L('Day Care egg is ready', 'Hay un huevo listo en la Guardería'), { note: L('boolean', 'booleano') }),
    '@daycareEggSteps': F(L('Steps until the Day Care egg is ready', 'Pasos hasta que haya huevo en la Guardería')),
    '@pokedexUnlocked': F(L('Unlocked Pokédex(es)', 'Pokédex desbloqueadas')),
    '@pokedexDex': F(L('Pokédex currently open', 'Pokédex abierta ahora'), {
      note: L('-1 is the National Dex', '-1 es la Pokédex Nacional'),
    }),
    '@pokedexIndex': F(L('Last species viewed, per Dex', 'Última especie vista en cada Pokédex')),
    '@pokedexMode': F(L('Pokédex search mode', 'Modo de búsqueda de la Pokédex')),
    '@healingSpot': F(L('Respawn point', 'Punto de reaparición'), {
      note: L('map/position the player wakes up at after fainting',
        'mapa y posición donde despiertas tras quedar debilitado'),
    }),
    '@escapePoint': F(L('Dig/Escape Rope return point', 'Punto de vuelta de Excavar/Cuerda Huida')),
    '@pokecenterMapId': F(L('Respawn map', 'Mapa de reaparición'), { kind: 'maps' }),
    '@visitedMaps': F(L('Maps visited', 'Mapas visitados'), {
      note: L('drives the Town Map / fly destinations', 'define el Mapa Pueblo y los destinos de Vuelo'),
    }),
    '@safariState': F(L('Safari Zone state', 'Estado de la Zona Safari')),
    '@bugContestState': F(L('Bug Catching Contest state', 'Estado del Concurso de Captura de Bichos')),
    '@phoneNumbers': F(L('Registered phone contacts', 'Contactos guardados en el teléfono')),
    '@phoneTime': F(L('Phone call cooldown timer', 'Tiempo de espera entre llamadas')),
    '@safesave': F(L('Safe to save', 'Se puede guardar aquí'), {
      note: L('boolean; the game sets this once it has confirmed the current map is a valid save location',
        'booleano; el juego lo activa cuando confirma que el mapa actual es un sitio válido para guardar'),
    }),
  },
};

/** Label + hints for one ivar of one class. */
export function fieldInfo(cls, name) {
  const f = CLASS_FIELDS[cls] && CLASS_FIELDS[cls][name];
  return f || { label: name.replace(/^@/, '') };
}
