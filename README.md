# Pokémon Z save editor

A save editor for the **Pokémon Z** fangame (RPG Maker XP / Pokémon Essentials),
running entirely in the browser. Open a `.rxdata` save, edit it with real names
instead of raw numbers, and download the result.

Nothing is uploaded. The page has no server and no filesystem access — it only
ever sees the file you hand it.

## Use it

Open the published page, then drag a save onto it. Saves live in:

```
%USERPROFILE%\Saved Games\Pokemon Z
```

Edit, press **Download**, and copy the file back over the original. Keep a
backup of the original first.

To run it locally (ES modules need HTTP, `file://` will not work):

```bash
node tools/serve.js
```

## What it edits

- **Variables / Switches** — all 1000 entries with the names from the RPG Maker
  editor, filterable.
- **Trainer** — name, money, badges, Pokédex counts, flags.
- **Bag** — every pocket, with real item names.
- **Party & Boxes** — view and edit Pokémon, and **add new ones**, remove them,
  or move them between the party and the boxes.
- **Raw tree** — all 15 Marshal streams, lazily expanded, labeled where known.

## Two things that make Pokémon Z saves awkward

**A save is 15 back-to-back Marshal streams, not one object.** `pbSave()` calls
`Marshal.dump` fifteen times into the same file. A tool that calls `Marshal.load`
once — including `@hyrious/marshal`, which general-purpose `.rxdata` editors use
— reads `$Trainer` and stops. `src/marshal.js` exposes `loadAll` / `dumpAll` for
this.

**RGSS is 32-bit Ruby 1.8, where a `Fixnum` is 31-bit signed.** Any integer
outside `-1073741824 .. 1073741823` must be marshalled as a `Bignum` (`l`), not a
`Fixnum` (`i`). Marshal's reader runs a raw `INT2FIX` on an `i` payload, so a
too-large value **silently wraps to a negative number** with no load-time error.

That matters the moment you create a Pokémon: `@timeReceived` is a unix timestamp
(~1.79 × 10⁹) and `@personalID` is a random 32-bit number. A wrapped
`@timeReceived` crashes the trainer notes screen with:

```
Script 'PokeBattle_Pokemon' line 88: ArgumentError occured.
time must be positive
```

because line 88 is `Time.at(@timeReceived)`. The game's own saves show the
correct behaviour — `$Trainer.@id` is stored as a Bignum for exactly this reason.
The writer now promotes out-of-range integers automatically, including burning an
object-link table index the way Ruby does so later links stay aligned.

## The save slot

Variable 99 — named **"NO TOCAR"** ("do not touch") in the editor — holds the
slot number, and `pbSave()` rebuilds the filename from it on every save:

```ruby
if $game_variables[99]>1
    savename="Game_"+$game_variables[99].to_s+".rxdata"
else
    savename="Game.rxdata"
end
```

So renaming a save only changes where it appears in the load menu; the file still
writes itself back to whatever variable 99 says. **To move a save between slots
you must rename the file *and* set variable 99 to match.** Note the `>1`: both
`0` and `1` mean `Game.rxdata`.

The summary bar shows the slot next to the filename the game will write to, and
warns when they disagree.

## Creating Pokémon

`src/create.js` reimplements `PokeBattle_Pokemon#initialize` rather than
hand-assembling an object:

- **Exp comes from the level** via the game's own `@PBExpTable`. The game derives
  level *from* exp, so setting exp is the only way to set level.
- **Stats use `calcHP` / `calcStat`**, including the ±10% nature multipliers.
- **Moves default to the level-up set** the game would grant: every move learned
  at or below the level, de-duplicated, last four kept, each at full PP.
- **Nature, gender and shininess** fall out of a random 32-bit personal ID unless
  forced, exactly as `nature`, `gender` and `isShiny?` do. Forcing sets
  `@natureflag` / `@genderflag` / `@shinyflag`; leaving them alone omits the ivar,
  which the game reads as "not set".

Container rules match the game: the party is a compact array capped at 6, each
box is exactly 30 fixed slots, so removing from a box writes `nil` back into the
slot instead of shifting the others.

It does **not** create eggs with proper step counts, set ribbons or contest
stats, or check that a moveset is legal for the species.

## Game data

`data/gamedata.json` is generated from a game install and shipped with the site,
so the published page needs no access to your files:

| What | Source |
|---|---|
| Variable and switch names | `Data/System.rxdata` |
| Map names | `Data/MapInfos.rxdata` |
| Base stats, gender rate, happiness, growth rate | `Data/dexdata.dat` (76-byte records) |
| Species / item / move / ability names, level-up movesets | `PBS/*.txt` |

Regenerate it after a game update:

```bash
node tools/build-data.js "C:/path/to/Pokemon Z"
```

`src/expTable.js` is likewise generated, straight out of the game's own
`PBExperience` script inside `Data/Scripts.rxdata`:

```bash
node tools/gen-expTable.js "C:/path/to/Pokemon Z"
```

## Safety

- The editor serializes and **re-parses a save before handing it to you**. If the
  result is not a readable 15-stream save, you get an error instead of a file.
- Edits keep the field's existing Marshal type: a Fixnum field rejects `"twelve"`
  and `1.5` rather than quietly becoming a String or Float.
- **Revert** throws away every edit and goes back to the file you opened.
- Keep your own backup before overwriting a save. The page cannot make one for
  you — it never touches your disk.

## Repairing an older save

Saves written by an early build of this editor may contain the oversized-Fixnum
bug described above:

```bash
node tools/repair.js            # report only
node tools/repair.js --write    # fix, keeping a .bak
```

## Deploying

`main` is the source; **`gh-pages` is the published site**. Pushing to `main`
runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which tests,
builds and force-pushes the site to `gh-pages`. Doc-only changes are skipped via
`paths-ignore`.

```bash
node tools/build-site.js    # assemble _site/
node tools/serve.js         # try it locally
```

`_site` holds only what the page loads — `index.html`, `app.js`, `style.css`,
`src/`, `data/`, plus a `.nojekyll` — so tests, tools and history stay off the
deployed branch.

The deploy is gated on `test/smoke.js`: it boots the built site in headless
Chromium and checks the page comes up, the data bundle loads, and a real save
opens. There is no bundler here, so a bad import path or a missing file would
otherwise ship as a white screen with no build error. It serves from a
subdirectory so the URL matches how Pages serves the repo — every path in the
page is relative, and this is what would catch it if one were not.

Publishing uses plain `git` with the workflow's built-in `GITHUB_TOKEN`, so
there is no third-party action in the deploy path and no secret to configure.

## Tests

```bash
npm test
```

- `test/roundtrip.js` reads every `.rxdata` in a game install and save folder,
  dumps each back out, and requires the bytes to match exactly — 529 files
  including the 12.7 MB `PkmnAnimations.rxdata`. This is what makes it safe to
  rewrite a save: anything untouched is reproduced bit for bit.
- `test/edit.js` edits a save in memory and confirms undoing every edit lands
  back on the original bytes.
- `test/gamedata.js` cross-checks the baked bundle against `PBS/pokemon.txt` for
  all 1018 species.
- `test/create.js` checks generated stats against hand-computed values and
  confirms injected Pokémon can be removed byte-cleanly.
- `test/bignum.js` guards the Fixnum/Bignum boundary.
- `test/smoke.js` boots the built site in a browser (see above). Needs
  `npm install --no-save playwright && npx playwright install chromium`; it skips
  itself if Playwright is absent.

Tests that need a game install look at `PKMNZ_GAME_DIR` and `PKMNZ_SAVE_DIR`, and
skip cleanly when it is absent — which is why `npm test` passes in CI, where
neither exists.

## Licence

MIT. Not affiliated with Nintendo, Game Freak, or the Pokémon Company. Pokémon Z
is a fan project; this tool only reads and writes its save files.
