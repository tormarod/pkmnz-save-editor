# Usability & features — round 2

Based on a full read-through of `src/`, `app.js`, `index.html`, `style.css` and
`tools/` as of 2026-08-06, after the user-facing items of
`docs/plans/improvements.md` landed (level editing, sprites, undo/redo, the
pre-download change summary, draft persistence, the theme toggle, inline range
hints, and the first round of bulk actions).

Everything below is user-facing: what the tool cannot do yet, or makes harder
than it needs to be. Nothing here is code health.

## Tier 1 — cheap, high value

1. **Show what a Pokémon actually is on its card.** `describe()`
   (`src/create.js:262`) already derives nature, shininess and level from
   `@personalID`; it is covered by `test/create.js` and **called nowhere in the
   UI**. The card header (`src/ui/tabs/party.js:20`) shows only species,
   nickname, held item and HP. Meanwhile nature/gender/shiny/ability are
   editable *only* as override flags whose default option reads "Natural (from
   Personal ID)", which tells the user nothing about what it resolves to.

   Fix: expose `describe()` through `views.pokemon()` and render a
   `♀ · Adamant · ✨ Shiny · Static` line in the header; show the derived value
   next to each override dropdown so "Natural" has a visible meaning.

2. **Moves are bare numeric ID inputs.** `src/ui/tabs/party.js:252` builds
   `type: 'int'` inputs for `@id`, with the name in a static neighbouring cell,
   so changing a move means knowing its number. Every other id field already
   gets a searchable name combo box through `kind:`
   (`src/ui/session.js:206`), and `PBMove['@id']` is *already declared*
   `kind: 'moves'` in `src/schema.js:136` — the field info just isn't passed
   through. While here:

   - surface `@ppup` (parsed at `src/views.js:159`, never displayed),
   - allow adding a move to a Pokémon that has fewer than four, and removing
     one — today only the existing slots are editable,
   - add a per-Pokémon "restore PP" and "relearn the level-up set"
     (`movesAtLevel()` in `src/gamedata.js:65` already computes it).

3. **"To box" is hardcoded to box 0** (`src/ui/tabs/party.js:36` sends
   `{ direction: 'toBox', index, box: 0 }`). If box 1 is full, `addToBox`
   throws and the action fails with no way to pick another. Reuse the box
   picker the add-form already builds (`fillBoxPicker()`).

4. **The bag cannot delete an item.** `loadBag()` renders id and quantity
   inputs but no remove control; setting quantity to 0 leaves a zero-count
   entry in the pocket. Add a per-row remove, mirroring
   `roster.removeFromBox`'s handling in `src/bag.js`.

5. **Trainer ID and gender are Raw-tree-only.** The `simple` field list in
   `views.trainer()` (`src/views.js:95`) omits `@id` and `@gender`. `@id` is a
   Bignum, but `isScalar()` already accepts exact bignums
   (`src/save.js:203`), so both are a list addition, not new plumbing. Add
   `@gender` to `CLASS_FIELDS.PokeBattle_Trainer` in `src/schema.js` too — it is
   read by `roster.trainerOf()` but has no label. Trainer ID / secret ID is one
   of the most common reasons to open a save editor at all.

6. **Offer to download a backup.** The entire safety story is "keep your own
   backup first" (README, dropzone text), yet the app holds the untouched bytes
   in `state.originalBytes` (`src/localApi.js:24`) and never offers them. A
   "Download the original, unchanged" button next to Revert costs almost
   nothing and directly addresses this tool's one real risk.

7. **No responsive layout.** `style.css` has no `@media` query anywhere; the
   field grid, the summary bar and the add-forms are fixed multi-column, so the
   page is unusable on a phone or a narrow window.

8. **Keyboard shortcuts beyond undo/redo.** `app.js:252` binds Ctrl+Z/Ctrl+Y
   only. Add Ctrl+S → Download, `/` → focus the current tab's filter, and
   1–6 → switch tab.

## Tier 2 — tabs whose labels are already written

Three whole classes are fully labelled in `src/schema.js` and reachable only
through the Raw tree. The labelling was the hard part and it is already done.

9. **A World / Player tab** from `PokemonGlobalMetadata`
   (`src/schema.js:204`) — roughly 40 labelled fields: Game Corner coins, repel
   steps, step count, Running Shoes, the Snag Machine, respawn point, day care
   contents and egg steps, visited maps, phone contacts. Render it with the
   same `boundInput()` grid `loadTrainer()` uses; grouping into
   Movement / Progress / Day care / Pokédex sections is enough structure.

10. **An Options tab** from `PokemonSystem` (`src/schema.js:182`) — text speed,
    battle scene and style, window size, volumes, difficulty, fonts. Every
    field already carries its `options` list, so this is close to pure
    rendering.

11. **Teleport the player.** `Game_Player`'s `@x`/`@y`/`@direction`
    (`src/schema.js:169`) plus the `map_id` stream, with map names already
    baked into the bundle. "Move the player to `<map>`" is a load-bearing
    feature for an Essentials fangame — unsticking a save the player walked
    into a softlock in is a real reason to reach for an editor. Needs a
    caveat in the UI that map coordinates are not validated.

12. **A Pokédex editor.** The Trainer tab prints read-only counts
    (`src/ui/tabs/trainer.js:41`, from `src/views.js:118`). The `@seen` and
    `@owned` arrays are one boolean per species. Offer "mark all seen",
    "mark all owned", and a filterable per-species toggle list reusing the
    indexed-tab pattern from `src/ui/tabs/indexed.js`.

## Tier 3 — larger features

13. **A box grid view.** A full box renders as 30 stacked full-height cards
    (`src/ui/tabs/party.js:327`). Replace with the in-game 6×5 sprite grid,
    click to expand one into the existing card. Related gaps in the same tab:

    - boxes with no Pokémon are filtered out entirely (`:304`), so an empty box
      cannot be renamed or targeted,
    - `PokemonBox`'s `@name` and `@background` (`src/schema.js:156`) have no UI
      at all.

14. **Global search.** One box that searches variables, switches, items,
    species, moves and labelled fields at once and jumps to the hit's tab and
    row. With 1000 variables, 1000 switches and six tabs, this is the largest
    navigation win available.

15. **Reorder the party.** There is no way to change slot order, and the lead
    Pokémon matters in game. Drag, or plain up/down buttons on the card header,
    over a `roster.swapParty()` that splices the compact array.

16. **Filter within Party & Boxes** — by species, nickname, level, shiny or
    held item. There is no way to find one Pokémon among several hundred.

17. **A persistent change panel with per-change revert.** `state.changes` is
    maintained continuously (`src/localApi.js:104`) but only ever surfaces in
    the pre-download modal (`app.js:96`). Making it an always-available panel,
    with a revert button per entry, turns undo from strictly linear into "back
    out that one thing" without losing the edits made after it.

18. **A "check this save" validator** run before download, folded into the
    existing modal: EV total over 510, a single EV over 252, current HP above
    `@totalhp`, a level whose exp exceeds the growth-rate table, an egg that
    has a moveset or a nickname, an empty party, item quantities over the stack
    cap, and the slot mismatch the summary bar already detects. Warnings, not
    blocks — the point is catching a typo before it reaches the disk.

## Tier 4 — data bundle gaps blocking good UI

19. **`tools/build-data.js` only parses `Name`, `InternalName` and `Moves`**
    from `PBS/pokemon.txt` (`:101`). Adding `Abilities`, `HiddenAbility`,
    `Type1`/`Type2` and `Evolutions` unlocks, in order of value:

    - real ability names in the First / Second / Hidden dropdown — the
      `abilities` name table is already in the bundle but nothing connects it
      to a species,
    - type chips on Pokémon cards,
    - an "evolve this Pokémon" action,
    - the moveset/ability legality checks the README currently lists as a known
      limitation.

    This is the cheapest data change with the widest UI payoff. It costs bundle
    size, so measure before and after.

20. **Item icons cover ~80 curated vanilla items** (`src/sprites.js:27`);
    everything else renders nothing, leaving ragged rows. A neutral placeholder
    keeps the bag table aligned, and is honest about the fact that this
    fangame's item set cannot be mapped to a public sprite source.

## Tier 5 — a second round of bulk actions

21. Each is a few lines on top of the existing `/api/*` bulk-action pattern in
    `src/localApi.js` and its helper in `src/roster.js` / `src/bag.js`:

    - **Rare candy** — set the whole party to level N (one `startExperience()`
      write plus `recalcStats()` per Pokémon),
    - **Max EVs / clear EVs / preset spreads** (252/252/6),
    - **Max happiness**, **max PP Ups**,
    - **Give a set** — all Poké Balls, all TMs, a full healing kit,
    - **Egg tools** — "hatch now" (clear `@eggsteps`, set `@obtainMode` to 1),
      and "make this an egg". This also closes the `makePokemon()` egg-step gap
      the README documents.

## Loose ends

- The download reuses the original filename, so a browser saves it as
  `Game (1).rxdata` and the user must rename it before copying it back. The
  success toast should say so.
- `confirm()` and `alert()` are still used for the destructive prompts
  (`app.js:131`, `app.js:144`, and the remove-Pokémon confirm in
  `src/ui/tabs/party.js:47`) while a proper modal already exists for the change
  summary. Unifying them also fixes focus handling.
- Toasts are not announced to screen readers — `#toast` needs `aria-live`, and
  the change modal needs focus trapping and Escape to close.

## Suggested order

1 → 2 → 5 → 3 → 4 → 6 are all small and independent; 1 and 2 are the two the
user notices immediately.

Then 19 (data bundle), because 1's ability display and Tier 5's evolve action
both depend on it, and regenerating the bundle needs a game install on hand.

Then 9 and 10 as one piece of work — both are "render a labelled class with
`boundInput()`" and share whatever grouping helper the first one grows.
11 and 12 follow naturally as further tabs.

13 and 14 are the highest-impact and highest-effort items and should be scoped
separately. 17 is worth doing before 18, since the validator wants somewhere to
put its output and the change panel is that place.
