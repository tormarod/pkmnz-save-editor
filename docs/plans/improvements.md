# Improvement plan

Based on a full read-through of `src/`, `app.js`, `test/`, and CI as of 2026-08-06.

## Critical — safety gap

1. **CI doesn't actually verify save round-tripping.** `test/roundtrip.js` and
   `test/edit.js` — the tests that prove edits produce byte-identical,
   game-readable saves — silently skip and exit 0 when no real game
   install/save file is present, which is always true in CI. The single most
   safety-critical guarantee of this tool (never corrupt someone's save) is
   currently unverified by CI.

   Fix: commit a small synthetic or anonymized `.rxdata` fixture (a minimal
   save + a stripped game-data dir) so these tests run unconditionally in CI,
   not just on a maintainer's machine.

## Correctness / UX gaps

2. **Party/Boxes tab shows Experience, not Level** for existing Pokémon
   (`src/views.js:198`), even though the "Add Pokémon" form lets you type a
   level and `levelFromExperience()` already exists. Easy, high-value fix —
   show computed level next to (or instead of) raw exp.

3. **No structured editor for mail, ribbons, contest stats,
   daycare/egg, fused Pokémon** — fields exist in `schema.js` but are only
   reachable via the Raw tree. Worth picking 1-2 highest-value ones (e.g.
   held-item mail, ribbons) for a real UI.

4. **`makePokemon()` gaps documented in README**: no egg step-count handling,
   no ribbons/contest stats set, no moveset-legality check. Fine to leave as
   known limitations, but worth a UI hint (e.g. "this Pokémon was created,
   not hatched — no egg cycle set") if not fixed outright.

## User-facing features & polish

Aimed at making the app easier to use and less confusing for someone who
isn't reading the source — not code-health work.

9. **Species/Pokémon sprites and item icons.** Right now entries are
   text/ID rows only. `data/gamedata.json` already carries species/item
   identity; if sprite assets can be bundled (or referenced from the game
   install like `build-data.js` already does), showing a sprite next to each
   Pokémon and item would make the Party/Boxes and Bag tabs dramatically
   easier to scan — especially with ~1018 species in the dex.

10. **Edit Level directly on existing Pokémon, not just at creation.**
    `levelFromExperience()`/the exp table already exist and are used by the
    "Add Pokémon" form and stat recalculation. Existing Pokémon only expose
    raw `@exp` for editing (see item 2). Let the user type a target Level
    and derive the correct exp for the current growth rate, the way the
    creation form already does — removes the need to know exp values at all.

11. **A "what will change" summary before download/save.** The app tracks
    a `dirty` flag but not a structured diff. A simple before/after list
    ("Trainer money: 500 → 999999", "Added Pokémon: Pikachu Lv.50", "Bag:
    +5 Potion") shown before writing the file would build user confidence
    that the save will contain exactly what they intended, and would catch
    accidental edits before they're committed to disk.

12. **Undo/redo for individual edits**, not just the current all-or-nothing
    "Revert to opened file." Even a simple linear undo stack per field edit
    would let users back out one mistake without losing everything else
    they changed in the session.

13. **Inline range/format hints on numeric fields** (IV 0–31, EV 0–252 with
    a 510 total cap, level 1–100, money bounds, etc.) shown next to the
    input *before* the user submits, rather than only surfacing as an error
    toast from `coerce()` after the fact.

14. **Bulk/quick actions**, e.g. "max IVs," "heal party" (restore HP/PP/
    status), "sort box," or "fill bag pocket" — one-click operations for
    the most common reasons someone opens a save editor, instead of
    field-by-field edits repeated six times for a full party.

15. **Tooltips or a glossary for game-specific jargon** surfaced in the UI
    — `natureflag`, markings bitmask, `formseen`/`formlastseen`,
    `expall`, IV/EV, etc. Newer/non-technical users hit these labels with
    no explanation; a short `title=""` tooltip or an info icon per field
    would go a long way given the Raw tree and even some dedicated tabs
    use the game's internal ivar names directly.

16. **First-time-user onboarding / empty state.** Before a file is opened,
    explain in a sentence or two what the tool does and where to find a
    Pokémon Z save file (the dropzone currently just says to drop a file,
    with no context for a first-time visitor arriving from a link).

17. **Light theme / theme toggle.** The app is dark-only via CSS custom
    properties (`style.css`), which is an easy toggle to add given the
    variables are already centralized, for users who prefer light mode or
    need it for contrast/accessibility reasons.

18. **Draft persistence across accidental tab close.** There's a
    `beforeunload` guard, but a crash or accidental close still loses all
    edits. Persisting in-progress edits to `localStorage`/IndexedDB
    (keyed to the opened file) and offering to restore them on next visit
    would remove a real "lost an hour of edits" failure mode.

## Code health

5. **Duplicated `ivar()`/`getIvar()` helper** reimplemented near-identically
   in `views.js`, `bag.js`, `roster.js`, `create.js` — consolidate into one
   shared export.

6. **`app.js` is an 816-line monolith** mixing DOM construction, event
   wiring, and all 6 tabs. Not urgent, but every new feature (mail, ribbons,
   daycare UI) will keep growing it linearly. Consider splitting per-tab
   render logic into `src/ui/*.js` modules before adding more tabs.

7. **Hardcoded personal path** in `test/helpers.js` (fallback default
   `C:/Users/torma/Documents/LostieLauncher/Pokémon Z`) — harmless since env
   vars override it, but worth removing/genericizing before this repo is
   more widely shared.

8. **No lint/format config** (style is currently just manually consistent) —
   optional, low priority given the codebase is small and clean.

## Suggested order

1 (CI safety gap) → 2 (level display bug) → 5 (dedupe helper) → then pick
from 3/4 depending on what should actually be made editable next → 6/7/8 as
ongoing hygiene.

For user-facing work, 10 (edit level directly) and 2 are essentially the
same fix and should land together; 13 (inline range hints) and 15
(tooltips/glossary) are cheap, high-value polish; 9 (sprites) and 11
(change summary) are the highest-impact but highest-effort items and worth
scoping separately.
