// English UI strings - the editor's original wording.
// Keys are grouped by surface: nav.*, summary.*, gamestate.*, tag.*.

export const en = {
  'nav.unsaved': 'unsaved edits',
  'nav.changes': 'Changes',
  'nav.changesTitle': "Everything you've changed so far",
  'nav.searchTitle': 'Search everything (Ctrl+K)',
  'nav.search': 'Search',
  'nav.undoTitle': 'Undo the last edit (Ctrl+Z)',
  'nav.undo': 'Undo',
  'nav.redoTitle': 'Redo (Ctrl+Y)',
  'nav.redo': 'Redo',
  'nav.open': 'Open a save…',
  'nav.revert': 'Revert',
  'nav.revertTitle': 'Discard every edit and go back to the file you opened',
  'nav.backup': 'Download original',
  'nav.backupTitle': 'Download the file exactly as you opened it, with no edits',
  'nav.download': 'Download',
  'nav.language': 'Language',

  'summary.trainer': 'Trainer',
  'summary.money': 'Money',
  'summary.badges': 'Badges',
  'summary.party': 'Party',
  'summary.playTime': 'Play time',
  'summary.location': 'Location',
  'summary.timesSaved': 'Times saved',
  'summary.map': 'map {id}',
  'summary.slotMismatch': 'Slot mismatch',
  'summary.slotMatches': 'Slot matches',
  'summary.namedFile': 'This file is named ',
  'summary.butVar99': ', but variable 99 is ',
  'summary.andVar99': ', and variable 99 is ',
  'summary.writeBack': ', so the game will write it back to ',
  'summary.setVar99': '. Set variable 99 to {slot} to match the filename.',
  'summary.noAction': ' — no action needed.',

  'tab.gamestate': 'Game state',

  'gamestate.hint': 'Everything the game remembers as a number or an on/off flag: story progress, '
    + 'difficulty, badges, side quests and counters. Descriptions come from the game\'s own '
    + 'scripts and events.',
  'gamestate.search': 'Search by number, name or description…',
  'gamestate.allGroups': 'All groups',
  'gamestate.onlySet': 'Only named or non-default',
  'gamestate.showDead': 'Show entries with no effect',
  'gamestate.shown': '{shown} shown',
  'gamestate.shownOf': '{shown} of {total} shown',
  'gamestate.atDefault': '{n} left at default',
  'gamestate.nothing': 'Nothing matches.',
  'gamestate.more': '…{n} more, narrow the search',
  'gamestate.switch': 'Switch',
  'gamestate.variable': 'Variable',
  'gamestate.mapLine': 'map {id} · {name}',
  'gamestate.count': '{n} entries',
  'gamestate.on': 'On',
  'gamestate.off': 'Off',
  'gamestate.amuletNote': 'The step counter these share, @amuleto, is on the World tab. '
    + 'When it reaches zero all eighteen amulets switch off together.',

  'tag.script': 'read by the engine',
  'tag.scriptHint': 'A Ruby script reads this directly, so it changes how the game behaves, '
    + 'not just which events run.',
  'tag.dead': 'no effect found',
  'tag.deadHint': 'We could not find any event or script that reads this. It may still be used '
    + 'in a way we cannot trace, but editing it probably does nothing.',
  'tag.wide': 'affects {n} maps',
  'tag.wideHint': 'This one flag decides what happens on a lot of maps at once. Changing it can '
    + 'move large parts of the game out of step.',
  'tag.inverted': 'inverted',
  'tag.invertedHint': 'This one works backwards from what its name suggests — read the description.',
  'tag.reserved': 'reserved',
  'tag.reservedHint': 'Blocked out by the developers for future use. Nothing currently reads it, '
    + 'so editing it is harmless but has no visible effect.',
  'tag.computed': 'script condition',
  'tag.computedHint': "Pokémon Essentials' built-in placeholder name for a scripted condition "
    + '(time of day, day of week, …). The game evaluates that expression directly and does not '
    + "read this switch's stored value, so toggling it here will not change anything in-game.",
};
