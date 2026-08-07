# Switches and variables: what they actually do

Reference for the descriptions in [`data/annotations.json`](../data/annotations.json).
Every curated entry there should trace to a line in this document, and every line
here should trace to a script file, a map event or a piece of in-game dialogue.

Extracted from the game install at
`C:\Users\torma\Documents\LostieLauncher\Pokémon Z` on 2026-08-07 by
[`tools/xref.js`](../tools/xref.js), which reads `Data/Scripts.rxdata` (255 zlib
sections), all 507 `Data/Map*.rxdata`, `Data/CommonEvents.rxdata`,
`Data/MapInfos.rxdata` and `Data/System.rxdata`.

Regenerate with:

```bash
node tools/xref.js "C:/path/to/Pokemon Z"   # writes tools/_xref.json
```

`tools/_xref.json` is gitignored — it is a research artifact, not a build input.
`tools/build-data.js` calls `buildXref()` directly so the bundle has exactly one
source of truth, the game folder.

## What the extractor can and cannot see

It attributes a reference to an id when the reference names the id outright:

- **Event commands** — Control Switches (121), Control Variables (122), Input
  Number (103), Button Input (105), Conditional Branch (111) on a switch or a
  variable, variable operands of Change Gold / Items / Weapons / Armor,
  variable-addressed Transfer Player and Set Event Location, variable-addressed
  Show / Move Picture, and Script commands (355/655).
- **Page conditions** — `@switch1_id`, `@switch2_id`, `@variable_id` on
  `RPG::Event::Page::Condition`, plus the trigger switch of a common event.
- **Ruby** — `$game_switches[…]`, `$game_variables[…]`, `pbGet(…)`, `pbSet(…)`
  where the subscript is a literal or a resolvable constant. 522 constants are
  resolved from `NAME = 123` definitions, tracking the enclosing `module`/`class`
  so that `AdvancedPokedexScene::SWITCH` (200) and `RandomizedChallenge::SWITCH`
  (409) stay distinct — both are spelled bare `SWITCH` in their own file.

It cannot see an index the game computes at runtime. `$game_switches[poke[2]]`
and `$game_switches[loc[7]]` in the battle scripts are real references to ids
this tool will never name. **That is why "dead" is reported as an inference and
the UI says «no encontramos nada que lo lea», never «no hace nada».**

## The numbers

|                                        | switches | variables |
| -------------------------------------- | -------- | --------- |
| named in `System.rxdata`               | 830      | 241       |
| `----RESERVED-----` placeholders       | 16       | 12        |
| Essentials `s:` script-condition names | 17       | 0         |
| read or written by a Ruby script       | 64       | 16        |
| **no reference found anywhere**        | **104**  | **41**    |
| — of those, `RESERVED`                 | 16       | 12        |
| — of those, `s:` placeholders          | 15       | 0         |
| — **ordinary and unreferenced**        | **73**   | **29**    |

The 73 matches the figure the plan was written against. The plan's variable
figure was 31; this pass finds two more referenced, because it also models
picture coordinates, transfer targets and arithmetic operands as reads.

Reference counts are higher here than in the plan for the same reason — the plan
counted a narrower set of command types:

| id            | name               | writes | page gates | maps |
| ------------- | ------------------ | ------ | ---------- | ---- |
| SW 759        | NPCS desaparecidos | 3      | 1135       | 212  |
| SW 127        | NO TOCAR           | —      | —          | 65   |
| SW 322        | NUZASISTIDO        | —      | —          | 76   |
| SW 430        | TIMESKIP           | —      | —          | 44   |
| SW 800        | JUEGO PASADO       | —      | —          | 52   |

14 switches and 8 variables touch 40 maps or more; those get the `wide` tag.

Names are not unique. SW 196 and 209 are both `Cuarta lider`; SW 303 and 308 are
both `MSRestaurante`; VAR 99, 201, 202 and 203 are all `NO TOCAR`. 84 map names
are shared by 361 maps (`Casa` ×32, `Centro Pokémon` ×23, `Bastión Pokémon` ×18),
so **a map name alone cannot identify a location — the map id has to be shown**.

---

## Level cap and badges — group `badges`

`000_Settings.rb:363-389` maps twelve badge switches to twelve level caps:

| constant      | switch | name              | cap |
| ------------- | ------ | ----------------- | --- |
| *(none)*      | —      | `LEVELGYM0`       | 17  |
| `SWITCHGYM1`  | 88     | Primera medalla   | 27  |
| `SWITCHGYM2`  | 97     | Segunda Medalla   | 36  |
| `SWITCHGYM3`  | 150    | Tercera medalla   | 42  |
| `SWITCHGYM4`  | 211    | Cuarta medalla    | 50  |
| `SWITCHGYM5`  | 326    | Quinta medalla    | 56  |
| `SWITCHGYM6`  | 502    | Sexta Medalla     | 70  |
| `SWITCHGYM7`  | 503    | Septima Medalla   | 75  |
| `SWITCHGYM8`  | 504    | Octava Medalla    | 80  |
| `SWITCHGYM9`  | 505    | Novena Medalla    | 85  |
| `SWITCHGYM10` | 506    | Decima Medalla    | 94  |
| `SWITCHGYM11` | 744    | Alca y PN         | 100 |
| `SWITCHGYM12` | 744    | *(same switch)*   | 100 |

The cap is applied in three places, all with the same cascade — every `if` that
matches overwrites the previous one, so the **highest badge switch that is on
wins**:

- `084_PokeBattle_Battle.rb:2328-2344` — a Pokémon **at or above the cap earns 1
  EXP instead of its full share**. It does not stop levelling; it nearly stops.
- `202_RepExp.rb:726-737` — the same cascade in the Exp-Share redistribution.
- `115_PItem_Items.rb:283-294` — **Rare Candies refuse to work above the cap.**

Two traps:

- `SWITCHGYM6..10` point at switches **502–506**, which are the *display* badge
  series. The story badge switches are elsewhere. Turning on a story badge flag
  does not raise the cap; turning on 502–506 does.
- `SWITCHGYM11` and `SWITCHGYM12` are **both 744**, whose editor name is
  `Alca y PN` — a Puerta Yantra story flag, not a badge. Completing that story
  beat is what raises the cap to 100.
- SW **501** (`Quinta Medalla`), **507** (`Undecima Medalla`) and **508**
  (`Ultima Medalla`) are named like badges but nothing reads them. They are
  leftovers of an earlier numbering.

## Difficulty — group `mode`

`113_PTrainer_NPCTrainers.rb:73-90`, in the loop that builds every trainer's
Pokémon:

| mode        | switch | enemy IVs        | enemy EVs per stat  |
| ----------- | ------ | ---------------- | ------------------- |
| Fácil       | 698    | 0                | 0                   |
| Normal      | *none* | from the trainer file (`iv & 0x1F`) | `min(85, level*3/2)` |
| Radical     | 666    | 31               | `min(85, level*5/2)` |

`698` is tested first, so **if both are on, Easy wins**. SW 666 is also read by
`141_PScreen_Load.rb` (forces battle style Set on load), `143_PScreen_Options.rb`
(the options screen shows the mode) and `116_PItem_ItemEffects.rb`.

VAR 104 `CursorModo` and VAR 103 `CursorNuz2` are the intro menu cursors that set
these — map 1 `Intro`. VAR 375 `ESTILO BATALLA` holds the battle style.

Nuzlocke: SW 320 `NUZMAESTRO` (67 maps), 321 `NUZNORMAL` (66 maps), 322
`NUZASISTIDO` (76 maps) are the three Nuzlocke tiers, gating event pages
directly. SW 315/317/318 (`MenuNuz`, `NormalElegido`, `NuzlockeElegido`) are
unreferenced leftovers of the same menu.

`SHINYLOCKE = 927`, `STARTERLOCKE = 928`, `STARTERLOCKE2 = 930` are defined at
`000_Settings.rb:304-306` but **nothing reads the constants** — the switches
themselves are only touched by events.

## Experience — group `exp`

Four independent multipliers, applied in sequence and therefore stacking
multiplicatively:

| switch | name        | factor | source                       |
| ------ | ----------- | ------ | ---------------------------- |
| 661    | NO EXP      | ×0     | `202_RepExp.rb:708`          |
| 252    | Mas Exp     | ×1.10  | `202_RepExp.rb:712`          |
| 624    | Mas Mas Exp | ×1.20  | `202_RepExp.rb:716`          |
| 557    | NUEVA EXP   | ×1.25  | `084_PokeBattle_Battle.rb:2316` |

Each is a `.floor` of the running total. 661 zeroes it regardless of the others.
A Lucky Egg multiplies by 3/2 after these.

## Encounters and amulets — group `amulets`

SW **280–297** are the eighteen type Amulets, in the fixed order below. While one
is on, `103_PField_Encounters.rb:218+` filters the map's wild encounter table
down to Pokémon of that type — but only `if newencs.length > 0`, so **on a map
with no Pokémon of that type the amulet silently does nothing**.

| sw  | name        | type     | sw  | name       | type    |
| --- | ----------- | -------- | --- | ---------- | ------- |
| 280 | AMBICHO     | Bicho    | 289 | AMPLANTA   | Planta  |
| 281 | AMSINIESTRO | Siniestro| 290 | AMTIERRA   | Tierra  |
| 282 | AMDRAGON    | Dragón   | 291 | AMHIELO    | Hielo   |
| 283 | AMELECTRICO | Eléctrico| 292 | AMNORMAL   | Normal  |
| 284 | AMHADA      | Hada     | 293 | AMVENENO   | Veneno  |
| 285 | AMLUCHA     | Lucha    | 294 | AMPSIQUICO | Psíquico|
| 286 | AMFUEGO     | Fuego    | 295 | AMROCA     | Roca    |
| 287 | AMVOLADOR   | Volador  | 296 | AMACERO    | Acero   |
| 288 | AMFANTASMA  | Fantasma | 297 | AMAGUA     | Agua    |

`116_PItem_ItemEffects.rb:25-50` (`pbAmuleto`) sets the switch and puts the step
budget in `$PokemonGlobal.amuleto`. It **refuses to apply a second amulet while
`amuleto > 0`**. `116_PItem_ItemEffects.rb:115-132` decrements it on every step
taken (not while sliding on ice) and, at zero, clears **all eighteen switches
together**.

So the switch and the counter are one system: a switch on with `amuleto` at 0
filters encounters forever; `amuleto` above 0 with every switch off just counts
down doing nothing. `@amuleto` is already exposed in the World tab.

Other encounter flags:

- SW **457** `Cartel Torre Oscura` is `SHINY_WILD_POKEMON_SWITCH`
  (`000_Settings.rb:303`), read at `104_PField_EncounterModifiers.rb:11`. Set by
  the Poción Brillante / Shinyzador in `116_PItem_ItemEffects.rb` and cleared
  when the next wild battle ends. **The editor name is wrong for what it does.**
- SW **482** `MODIFIERS` (84 maps) enables the hand-built movesets for special
  wild battles — `104_PField_EncounterModifiers.rb:89+`.
- SW **215** `NO CAPTURAR` (84 maps) makes every Poké Ball bounce off:
  `084_PokeBattle_Battle.rb:80`, "¡Robar es de ladrones y políticos!".
- SW **855** `BOSS` (84 maps) marks boss encounters.

## Battle behaviour — group `battle`

| switch | name                       | effect                                                        |
| ------ | -------------------------- | ------------------------------------------------------------- |
| 33     | No money lost in battle    | `NO_MONEY_LOSS`, `084_PokeBattle_Battle.rb:4490` sets loss to 0 |
| 34     | No Mega Evolution          | `NO_MEGA_EVOLUTION`, blocks Mega at `:2050`                    |
| 279    | INTERRUMPIR COMBATE        | ends the battle after 2 turns (`:2941`)                        |
| 453    | INTERRUMPIR COMBATE BATIK  | ends the battle after 3 turns (`:2941`)                        |
| 662    | NUMERITOS                  | **inverted** — see below                                       |
| 824    | Anticrit                   | `CRIT_OVERRIDE_SWITCH`, `251_Anticriticos.rb`                  |
| 825    | Antifijo                   | `FIXED_DMG_OVERRIDE_SWITCH`, `251_Anticriticos.rb`             |
| 626    | EQUILIBRIO LV              | `240_Generaentrenador.rb:27` builds generated trainers at the scaled level |
| 411    | NO BARRAS ENTR             | `207_Barras_Entrenador.rb:52` hides the trainer bars           |

**SW 662 `NUMERITOS` is inverted.** `241_Numeritos.rb:6` reads it into a variable
literally named `showDamageNumberDesactivated`, so **ON hides** the floating
damage numbers and OFF shows them.

VAR 300 `SUBIDA STATS` is read by `087_PokeBattle_Scene.rb` for the stat-up
display.

## Comfort and interface — group `comfort`

| id      | name              | effect                                                        |
| ------- | ----------------- | ------------------------------------------------------------- |
| SW 200  | POKEDEX AVANZADA  | `AdvancedPokedexScene::SWITCH`, unlocks the enhanced Pokédex   |
| SW 801  | SIEMPRECORRER     | `ALWAYS_RUN_SWITCH`, `249_SiempreCorrer.rb`                    |
| SW 444  | BLOQUEO RETRATO   | blocks the portrait on the save screen; also blocks fast travel (`206_Menu_Mejorado.rb:1584`) |
| SW 445  | ADULTEZ           | picks the adult sprite set on the save screen (`142_PScreen_Save.rb:39`) |
| SW 999  | NO UPDATE FOLLOW  | `NO_UPDATE_SWITCH`, freezes the following Pokémon (`187_Following.rb`) |
| SW 325  | ARREGLO CONTROLES | set by `141_PScreen_Load.rb` on load; a control-scheme repair flag |
| SW 409  | RANDOM            | `RandomizedChallenge::SWITCH`, `247_RandomMain.rb` — randomizes every Pokémon |
| SW 129  | INCUBADORA        | `INCUBATOR_SWITCH`, `201_Incubadora.rb` — the player owns the incubator |
| SW 412  | Talisman Malvo Ef | `212_DiplomaPokedex.rb`                                        |
| SW 430  | TIMESKIP          | `098_PField_Field.rb:2142` swaps the player's outfit; gates 44 maps |

The save screen reads **VAR 51 `SEXO`** (1 or 2) and **VAR 88 `ETNIA`** (0, 1 or
2) to choose the character sprite — `142_PScreen_Save.rb:39-42`. Those two are
also read by `113_PTrainer_NPCTrainers.rb`, and are referenced across 127 and 80
maps respectively, so **changing them mid-game changes how NPCs address you.**

## Counters — group `counters`

The denominator is in the dialogue of the event that reports the count, which is
where these come from:

| variable | name                | goal  | dialogue                                    |
| -------- | ------------------- | ----- | ------------------------------------------- |
| VAR 70   | Nidos completados   | / 18  | «Has derrotado _ Nidos Alfa de 18.»         |
| VAR 111  | Habitantes Acrilico | / 18  | «Has traído a _ personas de 18 a Pueblo Acrílico.» (a reward needs at least 15) |
| VAR 112  | Estrellas Acertijo  | / 5   | «¡_ de 5 estrellas encontradas!»            |
| VAR 218  | RETO MTs            | / 108 | «Has obtenido _ MTs de 108.» (reward at 100) |
| VAR 226  | POKEMONTENIDOS      | / 1018| «Has capturado _ Pokémon de 1018.»          |

Maxima are shown as a **hint, not a clamp** — clamping would block repairing a
broken save.

Related resource counters, all script-read:

- VAR **238** `USOS VIAL` / VAR **239** `USOSTOTALES` — `USOSACTUALES` and
  `MAXIMOUSOS` in `200_PokeVial.rb`; the Poké Vial's remaining and total charges.
  239 is read 99 times; 238 is written 95 times.
- VAR **234** `PUNTOS` — `POKEBATTLE_POINTS_VARIABLE`, `230_Sistema de Puntos.rb`.
  Unreferenced by events.
- VAR **225** `PUNTOS BATALLA` — the Battle Points the Gran Hotel Luminalia shop
  spends.
- VAR **240** `PERSONAJES` — `INFOGRAFIAS_DESBLOQ`, `231_Guia Personajes.rb`,
  the character-guide unlock bitmask.
- VAR **926** `RECETAS` — `RECETAS_CRAFTEO`, `222_Crafteo.rb`, unlocked recipes.
- VAR **172** `TU EQUIPO` — `PARTYVAR`, `191_Borrar Equipo.rb`.
- VAR **233** `LEGENDARIOS COMP` — read by `137_PScreen_RegionMap.rb` together
  with SW 622 `Mision 3 legendarios`.
- VAR **301** `Hojitas` — `221_GIFs.rb`.
- VAR **200** `MONTURAS` — read by `098_PField_Field.rb` and
  `116_PItem_ItemEffects.rb`; no event writes it.

## The quest board — group `quests`

`CommonEvent 52 "Tablon Estrella"` plus **VAR 130 `Tablon Estrella`** (74 writes,
23 page gates, 52 maps) drive a board of side quests. Each quest has its own
`MS…` switch — **39 of them**:

298 MSGogoat · 299 MSTorreGuardia · 300 MSToxinas · 301 MSCondensador ·
302 MSIsidora · 303 MSRestaurante · 304 MSCampana · 305 MSMoneda Oro ·
306 MSDespensa · 307 MSCamara · 308 MSRestaurante · 310 MSBastionRelieve ·
389 MSEspino · 390 MSNinoVanitas · 391 MSJara · 392 MSHuerto1 · 393 MSBayas ·
394 MSPlumanegra · 395 MSCriptas · 396 MSCatedral · 494 MSFabrica · 545 MSForja ·
639 MSPuertaAlmacen · 640 MSRuta15 · 641 MSPuebloMosaico · 649 MSDandelio ·
650 MSPistia · 651 MSPintora · 652 MSBriof · 653 MSTorreOscura · 654 MSRotom ·
655 MSLoto · 656 MSMts · 657 MSBalneario · 675 MSCatOcc · 686 MSCalendula ·
695 MSExpansionLum · 696 MSMimi · 745 MSTorre Maestra

**303 and 308 are both named `MSRestaurante`** and are different quests.

## Character creation — group `character`

Map 1 `Intro` writes these before the game proper starts:

- VAR **51** `SEXO` — 1 or 2. Read 286 times across 127 maps.
- VAR **88** `ETNIA` — 0, 1 or 2. Read 618 times across 80 maps.
- VAR **150** `CursorGénero` — 0 or 1, the menu cursor.
- VAR **103** `CursorNuz2`, VAR **104** `CursorModo` — difficulty menu cursors.
- VAR **56** `Pokémon Inicial` — 0, 1 or 2, the starter.

## World and story state

- SW **759** `NPCS desaparecidos` — 3 writes, **1135 page conditions across 212
  maps**. The single widest flag in the game: it hides NPCs everywhere at once.
- SW **430** `TIMESKIP` — 44 maps, plus the outfit swap above.
- SW **800** `JUEGO PASADO` — 52 maps; post-game state, read by
  `227_Vuelotruco.rb` to move the fly destination.
- SW **758** `Arma Definitiva Culminada` — read with 800 by `227_Vuelotruco.rb:27`.
- SW **127** `NO TOCAR` — 65 maps, despite the name.
- SW **226** `Isla Acertijo 1` — `170_PSystem_System.rb`.
- SW **622** `Mision 3 legendarios` — `137_PScreen_RegionMap.rb`.

Everything else is story bookkeeping: roughly 724 switches and 183 variables that
mark a scene as played, a door as opened or an NPC as moved. They are grouped by
their **dominant map** — the map with the most references to that id — through
the map-id → chapter table in [`tools/chapters.js`](../tools/chapters.js).

Map ids run roughly chronologically, from Pueblo Lienzo (5) through Chateau
Rosillon (35–38), Ciudad Luminalia (161+), the Prisión del Olvido (225–228), the
Torre Oscura (262–266) and on to Pueblo Cromlech (480–502). "Roughly" is the
important word — see the risk note in the plan. Generic maps (`Casa` ×32,
`Centro Pokémon` ×23, `Bastión Pokémon` ×18) appear in every chapter, which is
why every row shows its map id and name rather than relying on the chapter alone.

## Known-dead entries

104 switches and 41 variables have no reference this tool can find. Of the
switches, 16 are `----RESERVED-----` and 15 are Essentials' `s:` script-condition
placeholders (`s:PBDayNight.isDay?`, `s:pbIsWeekday(-1,2,4,6)`, …) which are
notes to the event editor, not toggles — the engine evaluates the expression and
never reads the stored value.

The remaining 73 include entire abandoned systems, which is the useful part:

- **Essentials defaults never wired up** — SW 3–13 (`Choosing starter`,
  `Defeated Gym 1..8`, `Defeated Elite Four`, `Fossil revival in progress`),
  SW 29 `Has National Dex`, SW 31 `Shiny wild Pokémon` (superseded by 457),
  SW 51–58 (roaming legendaries, boulder puzzles), VAR 6–13.
- **A monotype challenge** — SW 151–157 `MONOBICHO`, `MONONORMAL`, `MONOVENENO`,
  `MONOVOLADOR`, `MONOAGUA`, `MONOPLANTA`, `MONOFUEGO`. Seven of eighteen types,
  never finished.
- **Alternate game modes** — VAR 52–54 `MODO CLÁSICO`, `MODO RANDOM`,
  `MODO AMARILLO`; VAR 803–805 `STARTER RANDOM 1..3`; SW 802 `MOVS RANDOM 2`.
- **Badge leftovers** — SW 501, 507, 508.
- **A casino** — VAR 221–223 `Resultado Color`, `Color Elegido`,
  `Fichas Apostadas`.
- **Loose settings** — SW 191 `Lente de la Verdad`, 214 `SAFARI ON`,
   332 `POKEDEX COMPLETADA`, 351 `ESCALADA`, 500 `SPRITES ESTATICOS`,
  819 `BATTLEBACK ANIMADO`, 998 `NOAUTOSAVES`.

These are hidden behind the «mostrar entradas sin efecto» toggle rather than
deleted, because the inference can be wrong.
