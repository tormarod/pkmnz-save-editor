// Spanish UI strings. The game is Spanish, so this is the default language and
// the one the descriptions in data/annotations.json are written in.

export const es = {
  'nav.unsaved': 'cambios sin guardar',
  'nav.changes': 'Cambios',
  'nav.changesTitle': 'Todo lo que has cambiado hasta ahora',
  'nav.searchTitle': 'Buscar en todo (Ctrl+K)',
  'nav.search': 'Buscar',
  'nav.undoTitle': 'Deshacer el último cambio (Ctrl+Z)',
  'nav.undo': 'Deshacer',
  'nav.redoTitle': 'Rehacer (Ctrl+Y)',
  'nav.redo': 'Rehacer',
  'nav.open': 'Abrir una partida…',
  'nav.revert': 'Descartar cambios',
  'nav.revertTitle': 'Descartar todos los cambios y volver al archivo que abriste',
  'nav.backup': 'Descargar original',
  'nav.backupTitle': 'Descargar el archivo tal y como lo abriste, sin ningún cambio',
  'nav.download': 'Descargar',
  'nav.language': 'Idioma',

  'summary.trainer': 'Entrenador',
  'summary.money': 'Dinero',
  'summary.badges': 'Medallas',
  'summary.party': 'Equipo',
  'summary.playTime': 'Tiempo jugado',
  'summary.location': 'Lugar',
  'summary.timesSaved': 'Veces guardado',
  'summary.map': 'mapa {id}',
  'summary.slotMismatch': 'La ranura no coincide',
  'summary.slotMatches': 'La ranura coincide',
  'summary.namedFile': 'Este archivo se llama ',
  'summary.butVar99': ', pero la variable 99 vale ',
  'summary.andVar99': ', y la variable 99 vale ',
  'summary.writeBack': ', así que el juego lo guardará en ',
  'summary.setVar99': '. Pon la variable 99 a {slot} para que coincida con el nombre del archivo.',
  'summary.noAction': ' — no hace falta hacer nada.',

  'tab.gamestate': 'Estado del juego',

  'gamestate.hint': 'Todo lo que el juego recuerda como número o como interruptor: avance de la '
    + 'historia, dificultad, medallas, misiones y contadores. Las descripciones salen de los '
    + 'propios scripts y eventos del juego.',
  'gamestate.search': 'Buscar por número, nombre o descripción…',
  'gamestate.allGroups': 'Todos los grupos',
  'gamestate.onlySet': 'Solo con nombre o modificados',
  'gamestate.showDead': 'Mostrar entradas sin efecto',
  'gamestate.shown': '{shown} visibles',
  'gamestate.shownOf': '{shown} de {total} visibles',
  'gamestate.atDefault': '{n} sin tocar',
  'gamestate.nothing': 'No hay nada que coincida.',
  'gamestate.more': '…{n} más, afina la búsqueda',
  'gamestate.switch': 'Interruptor',
  'gamestate.variable': 'Variable',
  'gamestate.mapLine': 'mapa {id} · {name}',
  'gamestate.count': '{n} entradas',
  'gamestate.on': 'Sí',
  'gamestate.off': 'No',
  'gamestate.amuletNote': 'Los pasos que comparten todos estos amuletos, @amuleto, están en la '
    + 'pestaña Mundo. Cuando llega a cero se apagan los dieciocho a la vez.',

  'tag.script': 'lo lee el motor',
  'tag.scriptHint': 'Un script de Ruby lo lee directamente, así que cambia cómo se comporta el '
    + 'juego, no solo qué eventos ocurren.',
  'tag.dead': 'sin efecto conocido',
  'tag.deadHint': 'No encontramos ningún evento ni script que lo lea. Puede que el juego lo use '
    + 'por una vía que no sabemos seguir, pero editarlo probablemente no haga nada.',
  'tag.wide': 'afecta a {n} mapas',
  'tag.wideHint': 'Este único indicador decide qué pasa en muchos mapas a la vez. Cambiarlo puede '
    + 'descuadrar partes grandes del juego.',
  'tag.inverted': 'invertido',
  'tag.invertedHint': 'Funciona al revés de lo que sugiere su nombre: lee la descripción.',
  'tag.reserved': 'reservado',
  'tag.reservedHint': 'Hueco que los desarrolladores dejaron bloqueado para uso futuro. Nada lo '
    + 'lee, así que editarlo es inofensivo y no tiene ningún efecto visible.',
  'tag.computed': 'condición de script',
  'tag.computedHint': 'Es el nombre que Pokémon Essentials pone a una condición calculada (hora '
    + 'del día, día de la semana…). El juego evalúa esa expresión directamente y no lee el valor '
    + 'guardado aquí, así que cambiarlo no altera nada en el juego.',
};
