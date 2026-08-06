`save.rxdata` is a real save from a fresh Pokemon Z game (1 party member,
empty boxes, ~1 minute of playtime), with all personally-identifying fields
scrubbed: trainer name, trainer ID, and the party Pokemon's OT name are all
replaced with `"TESTER"` / a fixed ID. Everything else — game state, flags,
the map factory, etc. — is untouched real save structure, which is what
makes it useful for the round-trip and edit tests: it exercises the same
Marshal shapes a real save does.

It exists so `npm test` verifies save round-tripping unconditionally in CI,
instead of silently skipping when no real game install/save is present
(`PKMNZ_GAME_DIR` / `PKMNZ_SAVE_DIR` are unset). See test/helpers.js
(`activeSaveDir`) and test/roundtrip.js.

Regenerate by loading a small real save with `Save`, overwriting the
`@name`/`@id`/`@ot` ivars, and calling `save.serialize()`.
