# Switches & variables — describe and group them

Based on a decompile of the game install at
`C:\Users\torma\Documents\LostieLauncher\Pokémon Z` as of 2026-08-07:
`Data/Scripts.rxdata` (255 zlib sections), all 505 `Data/Map*.rxdata`,
`Data/CommonEvents.rxdata` and `Data/System.rxdata`. The cross-reference records,
for every switch and variable, which events set it, which read it, which pages it
gates, what values it takes, and the dialogue in the same event page.

The problem: the Variables and Switches tabs show 830 + 241 raw Spanish dev names
in two flat lists. A player can guess `Segunda Medalla`; nobody can guess that
`Cartel Torre Oscura` is the shiny-potion flag, or that `NUMERITOS` is inverted.

## What the extraction found

|                                            | switches | variables |
| ------------------------------------------ | -------- | --------- |
| named in `System.rxdata`                    | 830      | 241       |
| `----RESERVED-----` placeholders            | 16       | 12        |
| Essentials `s:` script-condition names      | 17       | 0         |
| read directly by a Ruby script              | ~42      | ~15       |
| **no reference anywhere in scripts/events** | **73**   | **31**    |
| story / scene state                         | ~724     | ~183      |

So roughly 90 % is story bookkeeping, and the ~60 entries a player would actually
want to touch are buried in it.

### Findings that drive the design

- **Badges set the obedience level cap.** `000_Settings.rb` maps badge switches to
  caps, read in `084_PokeBattle_Battle.rb` and `115_PItem_Items.rb` (rare candies
  refuse above the cap): none → 17, SW 88 → 27, 97 → 36, 150 → 42, 211 → 50,
  326 → 56, **502 → 70, 503 → 75, 504 → 80, 505 → 85, 506 → 94, 744 → 100**.
  Two traps: `SWITCHGYM6..10` point at the *display* series 502–506, not the story
  series, and `SWITCHGYM11 == SWITCHGYM12 == 744` — whose name is `Alca y PN`, a
  Puerta Yantra story flag. SW 501, 507 and 508 are dead.
- **SW 457 is mislabelled.** Named `Cartel Torre Oscura`, it is really
  `SHINY_WILD_POKEMON_SWITCH`, set by the Poción Brillante / Shinyzador item and
  cleared at the end of the next wild battle.
- **Difficulty is real.** SW 666 (Radical) gives every enemy Pokémon 31 IVs and
  EVs `min(85, level*5/2)` and forces battle style Set on load; SW 698 (Easy)
  gives them 0 IVs and 0 EVs. Normal uses the trainer file's IVs and
  `min(85, level*3/2)`.
- **EXP switches stack multiplicatively:** SW 661 ×0, 252 ×1.10, 624 ×1.20,
  557 ×1.25.
- **SW 280–297 are the 18 type Amulets.** While one is on, the wild encounter
  table is filtered to that type; `@amuleto` (already in the World tab) is the
  step counter, and all 18 clear together when it runs out.
- **SW 662 `NUMERITOS` is inverted** — ON *hides* the floating damage numbers.
- **Blast radius matters.** SW 759 has 1044 event references across 212 maps;
  SW 430 `TIMESKIP` has 121; SW 800 `JUEGO PASADO` has 91.
- **35 `MS…` switches are one system** — the quest board, driven by
  `CommonEvent 52 "Tablon Estrella"` plus VAR 130.
- **Counters have denominators in the dialogue:** VAR 70 nests /18, VAR 111
  settlers /18, VAR 218 TMs /108, VAR 112 stars /5.
- **Names are not unique.** SW 196 and 209 are both `Cuarta lider`; 303 and 308
  both `MSRestaurante`; VAR 99/201/202/203 all `NO TOCAR`. ~110 map names repeat
  (`Bastión Pokémon` ×12), so a map name alone cannot identify a location — the
  map **id** has to be shown too.

## Decisions

Settled with the user before writing this:

| Question         | Decision                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| Description scope | Hand-write the ~250 that matter; generate the ~820 story flags           |
| Language          | Spanish first; English stubs falling back to Spanish; app-wide toggle    |
| Story grouping    | ~20 chapter cards, map id + name shown on every row                      |
| Tab layout        | One "Game state" tab replacing the separate Variables and Switches tabs  |
| Dead entries      | Hidden behind a "mostrar entradas sin efecto" toggle                     |
| Risky flags       | Warning badge only, no confirmation dialog                               |
| Linked values     | Raw toggles + explanatory notes; no derived helper controls              |
| Data location     | Checked-in `data/annotations.json`, merged into the bundle at build time |
| Bundle            | Added to `gamedata.json`, no lazy loading                                |
| Dev names         | Kept, secondary styling, still searchable                                |

Assumptions taken rather than asked:

- Counter maxima are shown as a **hint, not a clamp** — clamping would block
  repairing a broken save.
- Gameplay cards start expanded; the ~20 story-chapter cards start collapsed.
- Language defaults to Spanish, persisted in `localStorage`.
- The existing `reserved` / `computed` tags stay, folded into one tag vocabulary.

---

## Phase 0 — freeze the research into a repo artifact

1. Add `tools/xref.js`: walks `Data/Map*.rxdata`, `CommonEvents.rxdata` and the
   inflated `Scripts.rxdata`, emitting `tools/_xref.json` of
   `{writes, reads, maps, dominantMap, scriptRead, values}` per id. Build input,
   not shipped.
   → verify: reproduces the table above — 830/241 named, 73/31 dead,
   SW 759 = 1044 references across 212 maps.
2. Add `docs/switches-variables.md`: the full per-category reference, so every
   hand-written description traces to a documented source line.
   → verify: each curated entry in Phase 1 cites a script file or map/event.

## Phase 1 — author `data/annotations.json`

```json
{
  "switches": {
    "457": {
      "g": "battle",
      "tag": ["script"],
      "es": {
        "n": "Poción Brillante activa",
        "d": "El próximo Pokémon salvaje que encuentres será variocolor. Se activa al usar el Shinyzador y se apaga sola al terminar el combate. El nombre interno («Cartel Torre Oscura») no corresponde a lo que hace."
      },
      "en": null
    },
    "502": {
      "g": "badges",
      "tag": ["script"],
      "es": { "n": "Sexta medalla", "d": "Sube el límite de obediencia a nivel 70." }
    }
  }
}
```

- `g` — group key. Gameplay: `mode`, `battle`, `exp`, `badges`, `comfort`,
  `field`, `amulets`, `quests`, `legendaries`, `world`, `counters`, `character`,
  `system`, `minigame`. Story: `ch01`…`ch20`. Placeholders: `none`.
- `tag[]` — `script` (engine reads it), `dead` (nothing found that reads it),
  `reserved`, `computed`, `wide` (≥ 40 maps), `inverted` (SW 662).
- `en: null` → the UI falls back to `es`. No English is invented.

Authoring split:

3. **~250 curated entries**, hand-written from `docs/switches-variables.md`: the
   engine-read switches, difficulty / EXP / level cap, the 18 amulets, the quest
   board, every counter with its denominator, the character-creation variables,
   and each mislabelled or inverted one.
4. **~820 generated entries** — `tools/gen-annotations.js` fills `g` from the
   dominant map via a map-id → chapter table, and writes `d` from a template:
   *«Marca de historia de **Chateau Rosillon** (mapa 36). La activan 5 eventos;
   la leen 55.»* Curated entries always win; the generator never overwrites one.
   → verify: a test asserts every named id has a `g`, and that curated ids
   survive a regeneration byte-for-byte.

The chapter table (map id → `ch01`…`ch20`) is the only real judgement call. It
lives alone in `tools/chapters.js` so it can be reviewed in isolation.

## Phase 2 — bake into the bundle

5. `tools/build-data.js`: merge `annotations.json` with the mechanical facts from
   `_xref.json`, changing `variables` / `switches` from `{id: "Name"}` to
   `{id: {n, g, d, tag, maps, dominantMap}}`.
   → verify: `data/gamedata.json` parses, the size delta is as expected, and the
   round-trip tests pass untouched.
6. `src/labels.js`: `nameOf()`, `optionsFor()` and `labelCounts()` keep working
   against the new shape; `special()` grows into `tagsOf()` returning the tag
   array.
   → verify: the existing tests in `test/` pass with no assertion changes.

## Phase 3 — language toggle

Goes before the UI rewrite because it reaches outside the new tab.

7. Add `src/i18n.js` (`t()`, `setLang()`, `lang()`) with `src/locales/es.js` and
   `src/locales/en.js`. `en` is today's UI text; `es` is written fresh. A missing
   key falls back to the other language, never blank.
8. Language control in the header next to the file chip, persisted in
   `localStorage`, re-rendering the active tab on change.
9. Migrate UI strings to `t()`. **Scoped** to the header, the summary and the new
   Game state tab; Party / Bag / Dex / Trainer / World / Raw keep their English
   literals until a follow-up round. Converting all seven tabs at once is a large
   mechanical diff that would bury the feature.
   → verify: toggling switches every string on the migrated surfaces; an
   untranslated key renders the fallback, not `undefined`.

## Phase 4 — the "Game state" tab

10. Replace the `variables` and `switches` tab buttons and panels with one
    `data-panel="gamestate"`. Delete `src/ui/tabs/indexed.js`; add
    `src/ui/tabs/gameState.js`.
11. `src/views.js`: add `gameState(save, opts)` returning rows from **both**
    sections in one list, each carrying `kind: 'switch' | 'variable'`, its group,
    tags, dev name, map and the existing Marshal `path` — so writes still go
    through the generic `Save#set` with no new save logic.
12. Render one card per group in a fixed order: gameplay groups, then
    `ch01`…`ch20`, then placeholders. Header shows the group name and a count.
    Gameplay cards expanded, story cards collapsed.
13. Row layout:
    - `#123` · **new label** · dev name (small, muted)
    - the description
    - `mapa 36 · Chateau Rosillon` when there is a dominant map
    - tag pills: `script`, `sin efecto`, `afecta a 212 mapas`, `invertido`,
      `reservado`
    - the existing on/off pill for switches, the existing bound input for
      variables
14. Controls: search (matching id, new label **and** dev name), a group filter,
    the existing "only named or non-default" toggle, and a new "mostrar entradas
    sin efecto" toggle, off by default.
    → verify: with a real save loaded, editing a switch and a variable from the
    new tab round-trips byte-identically apart from the intended change;
    searching `NUZMAESTRO` still finds SW 320.

## Phase 5 — cross-tab follow-ups

15. The World tab already shows `@amuleto` and `@shinyzador`; link them to the
    amulet card so the step counter and the type switch read as one system.
16. Repoint the header search (`#searchInput`), which currently spans the two
    tabs being removed.
17. Update `README.md`, `docs/` and the tab hint text.

---

## Risks

- **The chapter table is judgement, not extraction.** Map ids are only roughly
  chronological, and generic maps (`Casa`, `Bastión Pokémon` ×12, Poké Centers)
  appear across many chapters, so some flags will land in a chapter that reads
  slightly off. Showing the map id and name on every row is the mitigation.
- **"Dead" is an inference.** It means no map event, common event or Ruby script
  that could be modelled references the id. A `pbSet` behind a computed index, or
  a script string the parser missed, would be invisible. Hence hidden behind a
  toggle rather than deleted, and the tag text should read "no encontramos nada
  que lo lea", not "no hace nada".
- **Removing the Variables and Switches tabs is one-way.** Keeping them as raw
  escape hatches beside the new tab is a small change to Phase 4, but only before
  it starts.
- **English stays empty until the English build is available.** Every `en` is
  `null`, so game content shows Spanish in both modes; only the chrome is
  genuinely bilingual.

## Order

Phases 0 → 2 give a correct, tested data layer with the current UI still working.
Phase 3 is independent. Phase 4 is the visible payoff. Stop after each phase for
review.
