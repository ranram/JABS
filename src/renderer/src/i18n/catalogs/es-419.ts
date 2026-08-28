import type { LocaleCatalog } from "./en";

export const es419 = {
  common: {
    language: "Idioma",
    languages: { en: "English", es419: "Español (Latinoamérica)" },
    actions: {
      close: "Cerrar",
      cancel: "Cancelar",
      done: "Listo",
      previous: "Anterior",
      next: "Siguiente",
      resetScores: "Reiniciar marcadores",
      swapPlayers: "Intercambiar jugadores",
      select: "---- Seleccionar ----",
    },
    status: {
      live: "En vivo",
      sending: "Enviando",
      loading: "Cargando…",
      reconnecting: "Reconectando",
      ready: "Listo",
      working: "Procesando",
      pending: "Pendiente",
      completed: "Completado",
      onStream: "En stream",
    },
    match: {
      bestOf: "Mejor de {{count}}",
      seed: "Seed {{seed}}",
      set: "Set {{id}}",
      stream: "Stream",
      versus: "vs.",
      finalScore: "Marcador final: {{one}} - {{two}}",
    },
    mediaFolder: {
      open: "Abrir carpeta",
      openFailed: "JABS no pudo abrir la carpeta de medios.",
    },
    pagination: "Página {{page}} de {{totalPages}}",
  },
  overlay: {
    invalidTitle: "URL de overlay no válida",
    invalidBody:
      "Usa /overlay/active/main, /overlay/active/winner, /overlay/commentators o una ruta fija de juego compatible.",
    waiting: "Esperando el estado local de la partida…",
    broadcastInformation: "Información de stream",
    winnerAnnouncement: "Ganador del set",
    championAnnouncement: "Campeón",
    playerScore: "Marcador de {{player}}: {{score}}",
  },
  operator: {
    appSubtitle: "Just Another Bracketing System",
    topbar: {
      onStream: "En transmisión",
      loadingState: "Cargando estado…",
      apiVerified: "API verificada",
      sessionToken: "Token de sesión",
      tokenStored: "Token guardado",
      sessionMode: "Modo de sesión",
      needsToken: "Requiere token",
    },
    workspaces: {
      aria: "Espacios de trabajo de JABS",
      bracket: "Gestión de bracket",
      otherOverlays: "Otros overlays",
      topEight: "Generador de Top 8",
      thumbnail: "Generador de miniaturas de YouTube",
      otherOverlaysTitle: "Otros overlays para OBS",
      otherOverlaysDescription:
        "Overlays de streaming preparados para otras pantallas o fuentes de OBS.",
      mediaFolders: "Carpetas de medios del usuario",
      available: "Disponible",
      obsSource: "Fuente de navegador de OBS",
      resolvingObs: "Resolviendo la URL local de OBS…",
      winnerAutomatic:
        "La misma fuente elige automáticamente Ganador del set o Campeón según el set completado y su ruta en el bracket.",
      styling: "Estilo",
      commentator: {
        loading: "Cargando presentación de comentaristas…",
        tournament: "Nombre del torneo",
        logo: "Logo del torneo centrado",
        person: "Comentarista {{count}}",
        name: "Nombre al aire",
        handle: "Red social",
        presentTimed: "Presentar por 10 segundos",
        showPersistent: "Dejar en pantalla",
        hide: "Ocultar overlay",
        timed:
          "Los comentaristas aparecerán y desaparecerán durante 10 segundos.",
        persistent: "Los comentaristas permanecerán visibles.",
        hidden: "Presentación de comentaristas oculta.",
        failedTitle: "No se pudo actualizar el overlay de comentaristas",
        failed: "No se pudo actualizar el overlay de comentaristas.",
      },
      resultScreen: {
        loading: "Cargando presentación de ganador y campeón…",
        currentWinner: "Ganador actual",
        winner: "Ganador del set",
        champion: "Campeón",
        noWinner: "Completa el set activo para determinar un ganador",
        showTournamentLogo: "Mostrar logo del torneo",
        showPlayerPhoto: "Mostrar foto del jugador",
        showSponsorLogo: "Mostrar logo del equipo/patrocinador",
        showCharacter: "Mostrar personaje",
        availableForWinner: "Disponible para el ganador actual.",
        unavailableForWinner: "No está disponible para el ganador actual.",
        failedTitle: "No se pudo actualizar la pantalla de ganador y campeón",
        failed: "No se pudo actualizar la presentación de ganador y campeón.",
      },
      tools: {
        versus: {
          title: "Pantalla versus",
          description:
            "Pantalla de versus, placement recientes e historial de enfrentamientos directos",
          next: "Carga un set para preparar la pantalla versus.",
        },
        winner: {
          title: "Pantalla de ganador y campeón",
          description:
            "Celebra al ganador del set o campeón del torneo con arte, foto y logo de equipo/patrocinador opcionales.",
        },
        commentators: {
          title: "Vista de comentaristas",
          description: "Presenta dos comentaristas al aire y sus redes sociales.",
        },
      },
      generators: {
        topEight: {
          title: "Generador de Top 8",
          description:
            "Crea un gráfico de finalistas con semillas y arte de personajes o jugadores según el juego.",
          emptyState:
            "Este es ahora un espacio independiente. La composición revisada y el sistema de recursos están listos para añadir los controles y la exportación.",
        },
        thumbnail: {
          title: "Generador de miniaturas de YouTube",
          description:
            "Crea una imagen legible usando datos reutilizables del torneo, jugadores y juego.",
          emptyState:
            "Este es ahora un espacio independiente. Los controles, la vista previa y la exportación se implementarán aquí sin mezclarlos con overlays de OBS.",
        },
      },
      versusScreen: {
        startgg: "start.gg historial de mano a mano",
        currentMatchup: "Match actual",
        noSet: "No hay set en transmisión",
        livePreview: "Vista previa",
        refreshHistory:
          "Actualizar historial de start.gg con jugadores actuales",
        historyEntries: "entradas historicas cargadas",
        startggProfileError:
          "Ambos jugadores necesitan perfiles vinculados de start.gg",
        obsCurrent: "OBS está actualizado",
        obsPending: "OBS se actualizará en 1 segundo…",
        loadingScreenSettings: "Cargando configuración de la pantalla versus…",
      },
    },
    topEight: {
      description:
        "Crea un top 8 completo de resultados y arte de personajes o jugadores según el juego.",
      ready: "Vista previa lista",
      draft: "Faltan detalles",
      game: "Catálogo de arte del juego",
      style: "Estilo de composición",
      styles: { mosaic: "Mosaico", neon: "Neón", editorial: "Editorial" },
      mediaMode: "Arte del Top 8",
      mediaModes: {
        character: "Arte de personajes",
        photo: "Fotos de jugadores",
      },
      adjustLayer: "Ajustar arte del participante",
      resetPlacement: "Restablecer posición",
      adjustHint:
        "Haz clic y arrastra el arte visible de un participante, o selecciónalo aquí para usar las flechas con precisión. Shift + flechas mueve más; +/− cambia el tamaño.",
      tournament: "Nombre del torneo",
      headline: "Titular",
      tournamentLogo: "Logo del torneo",
      noLogo: "Sin logo del torneo",
      background: "Fondo personalizado",
      chooseBackground: "Elegir imagen",
      removeBackground: "Quitar fondo",
      noBackground: "Sin fondo personalizado",
      backgroundHint:
        "PNG, JPEG o WebP opcional. Máximo 15 MB y 40 megapíxeles.",
      backgroundFailed: "JABS no pudo usar esta imagen de fondo.",
      nowDownloading: "Descargando ahora…",
      eventUrl: "URL de evento completado de start.gg",
      loadEventUrl: "Cargar Top 8 del evento",
      loadFromStartgg: "Cargar desde start.gg",
      manualEventDetails: "Detalles manuales del evento",
      manualEventUrl: "Enlace del evento",
      manualEventUrlHint: "Se muestra al pie del PNG exportado cuando se completa.",
      participantCount: "Número de participantes",
      standingsLoaded:
        "Se cargaron las posiciones finalizadas de {{event}}. Cada jugador importado sigue siendo editable.",
      standingsNotFinal:
        "start.gg todavía no reporta top 8 finalizado para este evento. El Top 8 manual no cambió.",
      standingsNotConventional:
        "Este evento no usa el orden convencional de 1.º, 2.º, 3.º, 4.º, dos 5.º y dos 7.º. El Top 8 manual no cambió.",
      standingsFailed:
        "JABS no pudo cargar las posiciones finalizadas de este evento.",
      downloadPng: "Descargar PNG 1920×1080",
      downloaded: "Se generó el PNG del Top 8.",
      downloadFailed: "JABS no pudo generar el PNG del Top 8.",
      assetsMatched: "{{count}} recursos del roster encontrados",
      assetFolder: "Arte de personajes proporcionado por el usuario:",
      portraitFolder: "Retratos cuadrados de personajes proporcionados por el usuario:",
      preview: "Vista previa en vivo",
      previewQuality:
        "La vista previa se reduce para caber en este espacio. La exportación se renderiza a 1920×1080 usando las imágenes originales de los recursos.",
      placements: "Posiciones del Top 8",
      placement: "Posición {{count}}",
      playerTag: "Tag del jugador",
      character: "Personaje",
      characters: "Personajes",
      sponsor: "Patrocinador / prefijo",
      country: "País",
      displayFlag: "Bandera mostrada",
      validation: {
        textRequired: "Se requieren el nombre del torneo y el titular.",
        entrantCount:
          "Una composición de Top 8 requiere exactamente ocho participantes.",
        placements:
          "Las posiciones deben usar el orden convencional de doble eliminación: 1.º, 2.º, 3.º, 4.º, dos 5.º y dos 7.º.",
        playerTag: "Cada participante del Top 8 requiere un tag.",
      },
    },
    thumbnail: {
      description:
        "Crea desde cero o usa la partida llamada a stream y descarga una imagen lista para YouTube",
      ready: "Lista para exportar",
      needsDetails: "Faltan detalles",
      game: "Catálogo de arte del juego",
      style: "Estilo de composición",
      styles: {
        versus: "Versus",
        spotlight: "Protagonista",
      },
      mediaMode: "Arte de jugadores",
      mediaModes: {
        character: "Arte de personajes",
        photo: "Fotos de jugadores",
      },
      assetFolder: "Arte de personajes proporcionado por el usuario:",
      portraitFolder: "Retratos cuadrados de personajes proporcionados por el usuario:",
      tournament: "Nombre del torneo",
      headline: "Fase · Ronda",
      logo: "Logo del torneo",
      noLogo: "Sin logo del torneo",
      useStreamMatch: "Usar partida en transmisión",
      autoStreamMatch:
        "Una nueva partida llamada a transmisión se convierte automáticamente en la miniatura inicial.",
      preview: "Vista previa en vivo",
      downloadPng: "Descargar PNG 1280×720",
      downloaded: "Se generó el PNG de la miniatura de YouTube.",
      downloadFailed: "JABS no pudo generar el PNG de la miniatura.",
      player: "Jugador {{count}}",
      adjustLayer: "Ajustar capa visual",
      adjustCharacter: "{{player}} · Personaje",
      adjustPhoto: "{{player}} · Foto del jugador",
      mediaScale: "Tamaño del recurso",
      resetPlacement: "Restablecer posición",
      showTournamentLogo: "Mostrar logo del torneo",
      showSponsorLogo: "Mostrar logo del patrocinador",
      adjustHint:
        "Haz clic y arrastra el arte visible para moverlo, o selecciónalo aquí para usar las flechas con precisión. Mayús + flechas mueve más; +/− cambia el tamaño.",
    },
    notices: {
      connection: "Conexión",
      dismiss: "Descartar notificación",
      actionFailed: "La acción falló",
      checkThis: "Revisa esto",
      done: "Listo",
      notice: "Aviso",
    },
    startgg: {
      title: "Bracket de start.gg",
      description:
        "Conecta, carga un evento y elige el siguiente set para stream.",
      verified: "Verificado",
      session: "Sesión",
      stored: "Guardado",
      offline: "Sin conexión",
      apiAccess: "Acceso a la API",
      tokenLocal: "Tu token permanece en este dispositivo.",
      secureStorage:
        "Se guarda con el almacenamiento de credenciales nativo del sistema operativo. El token nunca es visto por JABS.",
      sessionStorage:
        "El almacenamiento seguro de credenciales del sistema no está disponible. Puedes mantener el token en la memoria del proceso principal durante esta sesión; JABS no lo guardará y se descartará al salir.",
      tokenPlaceholder: "Pega el token de start.gg",
      saveToken: "Guardar token",
      useForSession: "Usar durante la sesión",
      removeToken: "Eliminar token",
      tournament: "Torneo",
      tournamentHint: "Slug o URL oficial de start.gg.",
      tournamentPlaceholder: "Slug del torneo o URL de start.gg",
      loadEvents: "Cargar eventos",
      recent: "Recientes",
      recentAria: "Torneos recientes",
      clearCache: "Borrar caché e historial del bracket",
      activeStateStays: "Si hay un match en stream este se mantendrá.",
      detectedProfile: "Perfil de juego detectado",
      eventAria: "Evento del torneo",
      selectEvent: "Selecciona un evento",
    },
    moderation: {
      title: "Excepciones de moderación",
      description:
        "Si encuentras un falso positivo real, agrega el valor completo en su propia línea, guarda el archivo y recárgalo aquí. Las entradas solo coinciden con valores exactos y no desactivan la moderación dentro de otros textos.",
      path: "Archivo:",
      open: "Editar lista permitida",
      reload: "Recargar lista",
      reloaded_one: "Lista de moderación recargada con {{count}} excepción.",
      reloaded_other: "Lista de moderación recargada con {{count}} excepciones.",
      openFailed: "JABS no pudo abrir la lista de moderación.",
      reloadFailed: "JABS no pudo recargar la lista de moderación.",
    },
    browser: {
      gameProfile: "Perfil de juego para el set",
      assetSlug: "Carpeta de recursos de personajes:",
      reloadAssets: "Recargar recursos",
      assetsReloaded:
        "Recursos recargados · Arte de personajes: {{characterArt}} · Retratos: {{characterPortraits}} · Logos de torneos: {{tournamentLogos}} · Logos de patrocinadores: {{sponsorLogos}} · Fotos de jugadores: {{playerPhotos}}",
      assetsReloadFailed: "No se pudieron recargar los catálogos locales de recursos.",
      chooseProfile: "Elige un perfil de juego",
      detectedFromEvent: "Detectado del evento: {{profile}}",
      unknownGame:
        "No se reconoce este evento. Elige el perfil del overlay antes de cargar un set.",
      phase: "Fase",
      allPhases: "Todas las fases",
      pool: "Pool / grupo de fase",
      allPools: "Todos los pools de la fase",
      stationNumber: "Número de estación",
      stationPlaceholder: "p. ej., 3",
      browse: "Explorar",
      poolPages: "Páginas de pools",
      allEventSets: "Todos los sets del evento",
      refresh: "Actualizar vista actual",
    },
    selector: {
      title: "Seleccionar set",
      view: "Vista de {{scope}}",
      total: "{{count}} en total",
      bracketOrder: "orden del bracket de start.gg",
      dirtyWarning:
        "Los cambios del estado de transmisión se están guardando automáticamente.",
      search: "Buscar sets",
      searchPlaceholder: "Jugador, ronda, estación o ID del set",
      loadingAll: "Cargando todas las páginas del bracket para buscar…",
      searchProgress:
        "Buscando en todo el bracket · página {{loaded}} de {{total}}. Los resultados aparecen al encontrarlos.",
      scanningFor: "Buscando “{{query}}” en las páginas restantes del bracket…",
      searchAll: "La búsqueda abarca los {{count}} sets de esta vista.",
      focusSearch:
        "Escribe una búsqueda para cargar partidas de todas las páginas.",
      searchView: "La búsqueda abarca toda esta vista.",
      regionAria: "Sets cargados del torneo",
      loadingSets: "Cargando sets…",
      loadingMore: "Cargando más sets",
      scrollMore: "Desplázate para cargar más",
      allLoaded: "Todos los sets están cargados",
      none: "No se encontraron sets en esta vista.",
      noMatch: "Ningún set de esta vista coincide con “{{query}}”.",
      tbd: "Por definir",
      winner: "Ganador",
      loser: "Perdedor",
      setPages: "Páginas de sets",
      streamAssignment: "Transmisión · {{name}}",
      scope: {
        event: "Evento",
        phase: "Fase",
        pool: "Pool",
        station: "Estación {{number}}",
      },
    },
    editor: {
      title: "Editar estado de transmisión",
      description:
        "Los cambios válidos se moderan, guardan y envían a OBS automáticamente.",
      unsaved: "Sin guardar",
      savePending: "Guardando pronto",
      saving: "Actualizando OBS…",
      notSent: "No enviado a OBS",
      gameProfile: "Perfil de juego",
      detectedGame: "Juego detectado",
      styling: "Estilo del Scoreboard",
      stylingDescription:
        "Cambia el diseño del overlay sin cambiar el catálogo de personajes del evento.",
      detectedOverride:
        "Detectado del evento: {{profile}}. Puedes cambiarlo después de cargar el set.",
      matchLength: "Duración de la partida",
      displayName: "Nombre visible",
      round: "Ronda",
      roundPlaceholder: "p. ej., Final de ganadores",
      station: "Estación",
      stationPlaceholder: "p. ej., Transmisión A",
      playerOne: "Jugador 1",
      playerTwo: "Jugador 2",
      save: "Guardar estado de transmisión",
      discard: "Descartar borrador",
      reload: "Recargar datos del bracket",
      playerTag: "Tag del jugador",
      prefix: "Prefijo",
      character: "Personaje",
      characters: "Personajes",
      notShown: "No mostrar",
      unavailableCharacter: "No disponible: {{character}}",
      colorOutfit: "Color / atuendo",
      colorOutfitHelp: "Usa el arte numerado correspondiente del catálogo local.",
      defaultOutfit: "Predeterminado",
      sponsor: "Patrocinador/equipo",
      state: "Estado / provincia",
      chooseCountryFirst: "Elige primero un país",
      pronouns: "Pronombres",
      seed: "Semilla",
      country: "País",
      displayFlag: "Bandera mostrada",
      countrySearch: "Buscar país, código ISO o bandera Pride",
    },
    broadcast: {
      title: "Extras de transmisión",
      enabled: "{{count}} activos",
      optional: "Rieles y logo opcionales",
      showRails: "Mostrar rieles informativos inferiores",
      leftRail: "Riel izquierdo",
      leftPlaceholder: "p. ej., !bracket · matcherino",
      rightRail: "Riel derecho",
      rightPlaceholder: "p. ej., twitch.tv/tucanal",
      showLogo: "Mostrar logo del torneo / patrocinador",
      logo: "Logo",
      chooseLogo: "Elige un logo",
      logoHint:
        "Añade archivos PNG, JPEG o WebP al directorio /tourney-logos y reinicia JABS para actualizar esta lista.",
      playerPhotosFolder: "Fotos de jugadores proporcionadas por el usuario:",
      sponsorLogosFolder: "Logos de patrocinadores proporcionados por el usuario:",
      tournamentLogosFolder: "Logos de torneo proporcionados por el usuario:",
    },
    live: {
      title: "Controles en vivo",
      dirtyWarning:
        "Esperando a que terminen de guardarse los cambios de transmisión.",
      startggResult: "Resultado de start.gg",
      report: "Reportar resultado",
      winner: "{{winner}} gana {{winnerScore}}–{{loserScore}}.",
      historyReady: "Historial de marcadores listo.",
      winnerOnly: "Solo G/P; se desconoce el orden de juegos.",
      obsTitle: "URLs de OBS",
      obsHelp:
        "Inicia JABS antes de que OBS cargue la fuente. Si OBS la abrió mientras JABS estaba cerrado, usa \"Actualizar caché de la página actual.\" en las propiedades de la fuente del navegador de OBS.",
      resolvingObs: "Resolviendo URL local de OBS…",
      copied: "Copiado",
      copyObs: "Copiar URL de OBS",
    },
    setActions: {
      closeAria: "Cerrar acciones del set",
      send: "Enviar a transmisión",
      sendHelp:
        "Carga jugadores y datos del bracket en el estado activo de OBS.",
      quick: "Actualización rápida de marcador",
      loading: "Cargando set…",
      quickHelp: "Registra y reporta esta partida sin alterar el set al aire.",
      alreadyComplete: "Este set ya se muestra como completado en start.gg.",
      accepted: "Aceptado por start.gg",
      streamUnchanged: "La partida activa de transmisión no cambió.",
      bracketSet: "Set del bracket",
      historyWarning:
        "Este set ya tenía marcador al abrirse, por lo que se desconoce el orden de juegos. Reinicia e ingresa de nuevo el resultado completo para reportar un marcador exacto; de lo contrario solo se enviará G/P.",
      charactersFor: "Personajes · {{player}}",
      characterHelp:
        "Elige los personajes antes de sumar la victoria del juego. Deja este campo vacío para no reportar ningún personaje.",
      resultCheck: "Comprobación del resultado",
      winner: "{{winner}} gana {{winnerScore}}–{{loserScore}}",
      reporting: "Reportando…",
      confirm: "Confirmar y actualizar bracket",
      safety:
        "JABS comprueba que start.gg no haya cambiado este set antes de enviarlo. Esto nunca reemplaza la partida mostrada en OBS.",
    },
    aria: {
      decreaseScore: "Reducir marcador de {{player}}",
      increaseScore: "Aumentar marcador de {{player}}",
    },
    readiness: {
      alreadyComplete: "Este set ya se muestra como completado en start.gg.",
      setMissing: "Carga un set de start.gg antes de reportar un resultado.",
      entrantsMissing:
        "Se requieren los ID de ambos participantes de start.gg para reportar un resultado.",
      scoreIncomplete:
        "Completa primero el marcador local. Este mejor de {{bestOf}} termina al llegar a {{target}} victorias.",
      historyMismatch:
        "El historial de juegos no coincide con el marcador en vivo. Corrige o reinicia el marcador antes de reportar.",
    },
    messages: {
      loadSearch:
        "No se pudieron cargar todas las páginas del bracket para buscar.",
      enterToken: "Ingresa primero un token de start.gg.",
      sessionTokenSaved:
        "El token de start.gg está activo solo durante esta sesión y se descartará al salir. Carga un torneo para verificarlo.",
      tokenSaved:
        "El token de start.gg se guardó localmente. Carga un torneo para verificarlo con start.gg.",
      saveTokenFailed: "No se pudo guardar el token.",
      tokenRemoved: "El token de start.gg se eliminó de este dispositivo.",
      removeTokenFailed: "No se pudo eliminar el token.",
      clearCacheConfirm:
        "¿Borrar las respuestas almacenadas del bracket de start.gg y el historial de torneos recientes? El estado activo y los cambios guardados permanecerán intactos.",
      cacheCleared:
        "Se borraron las respuestas almacenadas del bracket y el historial de torneos recientes. Se conservaron el estado activo y los cambios guardados.",
      clearCacheFailed:
        "No se pudieron borrar los datos almacenados del bracket.",
      tournamentRequired:
        "Ingresa primero el slug de un torneo o una URL de start.gg.",
      cachedEvents: "Se cargaron {{count}} eventos almacenados.",
      noEvents:
        "No se encontraron eventos. Revisa el slug o la URL y confirma que el torneo sea visible en start.gg.",
      loadEventsFailed: "No se pudieron cargar los eventos.",
      loadedPhases: "Se cargaron {{count}} fases.",
      phasesFailed: "Fases: {{message}}",
      loadPhasesFailed: "No se pudieron cargar las fases.",
      showingEventSets: "Mostrando {{shown}} de {{total}} sets del evento.",
      showingPhaseSets: "Mostrando {{shown}} de {{total}} sets de la fase.",
      setsFailed: "Sets: {{message}}",
      loadSetsFailed: "No se pudieron cargar los sets.",
      selectEvent: "Selecciona primero un evento.",
      loadedPools: "Se cargaron {{shown}} de {{total}} pools.",
      poolsFailed: "Pools: {{message}}",
      loadPoolsFailed: "No se pudieron cargar los grupos de fase.",
      selectPhase: "Selecciona primero una fase.",
      positiveStation: "Ingresa un número de estación positivo.",
      showingScopeSets: "Mostrando {{shown}} de {{total}} sets de {{scope}}.",
      quickLoadFailed:
        "No se pudo cargar este set para la actualización rápida.",
      quickSetRequired: "Carga primero un set para la actualización rápida.",
      quickConfirm:
        "¿Reportar rápidamente a {{winner}} como ganador en start.gg?\n\n{{playerOne}} {{scoreOne}}–{{scoreTwo}} {{playerTwo}}\nID del set: {{setId}}\n\nEsto actualiza el bracket en vivo sin cambiar la partida en transmisión.",
      quickReceipt:
        "{{winner}} ganó {{winnerScore}}–{{loserScore}}. start.gg aceptó el set {{setId}}{{completion}}.",
      markedComplete: " y lo marcó como completado",
      quickReportFailed: "No se pudo reportar rápidamente este set a start.gg.",
      selectSetFailed: "No se pudo seleccionar el set.",
      streamSaved:
        "El estado de transmisión se guardó localmente y se envió a los overlays conectados.",
      saveStreamFailed: "No se pudo guardar el estado de transmisión.",
      reportSetRequired:
        "Carga un set de start.gg antes de reportar un resultado.",
      reportConfirm:
        "¿Reportar a {{winner}} como ganador en start.gg?\n\n{{playerOne}} {{scoreOne}}–{{scoreTwo}} {{playerTwo}}\n{{history}}ID del set: {{setId}}\n\nEsto modifica el bracket en vivo y puede avanzar participantes.",
      reportHistoryExact:
        "El historial registrado de {{count}} juegos también reportará el marcador del set.\n",
      reportHistoryWinnerOnly:
        "Solo se puede reportar G/P porque este set comenzó con marcadores pero sin un orden de juegos registrado.\n",
      reportExactSuccess:
        "{{winner}} y el marcador {{winnerScore}}–{{loserScore}} se reportaron en start.gg.",
      characterSelectionsReported:
        "Selecciones de personaje incluidas: {{count}}.",
      reportWinnerSuccess:
        "{{winner}} se reportó como ganador en start.gg. El marcador no se envió porque no había un orden de juegos confiable.",
      selectorRefreshFailed:
        "No se pudo actualizar el selector de sets; usa Actualizar vista actual.",
      reportFailed: "No se pudo reportar el set a start.gg.",
      reloadConfirm:
        "¿Reemplazar los jugadores, marcadores, ronda y estación guardados con los últimos datos disponibles de start.gg? Se conservará el perfil de juego actual. Esto no se puede deshacer.",
      reloadFailed: "No se pudo recargar este set de start.gg.",
      scoreFailed: "No se pudo actualizar el marcador.",
      scoresReset: "Se reiniciaron los marcadores.",
      playersSwapped: "Se intercambiaron los lados de los jugadores.",
      stateFailed: "No se pudo actualizar el estado de transmisión.",
      obsCopied:
        "La URL del overlay activo de OBS se copió al portapapeles del sistema.",
      copyFailed: "No se pudo copiar la URL local.",
      cachedResult:
        "{{message}} Mostrando datos almacenados desde {{cachedAt}}{{reason}}",
      cachedBecause: " porque {{warning}}",
      earlierSession: "una sesión anterior",
    },
  },
  errors: {
    generic: "Algo salió mal.",
    localSettings: "No se pudo cargar la configuración local de la aplicación.",
    updateScore: "No se pudo actualizar el marcador.",
    updateState: "No se pudo actualizar el estado de transmisión.",
    copyUrl: "No se pudo copiar la URL local.",
    invalidPort: "JABS recibió un puerto no válido para la API local.",
    desktopTokenOnly:
      "La administración del token solo está disponible dentro de la aplicación de escritorio JABS.",
    localService:
      "El servicio local de JABS dejó de responder en {{url}}. Reinicia la aplicación de escritorio e inténtalo de nuevo. El archivo jabs-main.log sin contenido de usuario está en el directorio de datos de la aplicación.",
    localServiceAfterRetry:
      "El servicio local de JABS dejó de responder en {{url}} después de un reintento. Reinicia la aplicación de escritorio e inténtalo de nuevo. El archivo jabs-main.log sin contenido de usuario está en el directorio de datos de la aplicación.",
    http: "La solicitud falló con HTTP {{status}}",
    startgg: {
      tokenMissing:
        "Guarda un token de la API de start.gg antes de cargar datos del bracket.",
      authentication:
        "start.gg rechazó el token. Comprueba que siga vigente y vuelve a guardarlo.",
      permission:
        "Este token de start.gg no tiene permiso para la acción solicitada en el torneo.",
      rateLimit:
        "Se alcanzó el límite de solicitudes de start.gg. Espera aproximadamente un minuto e inténtalo de nuevo.",
      queryComplexity:
        "start.gg rechazó esta solicitud por ser demasiado compleja. Reduce la vista del bracket e inténtalo de nuevo.",
      timeout: "start.gg tardó demasiado en responder. Inténtalo de nuevo.",
      network:
        "JABS no pudo comunicarse con start.gg. Revisa la conexión a internet e inténtalo de nuevo.",
      upstream:
        "start.gg no está disponible temporalmente. Inténtalo de nuevo en breve.",
      invalidResponse:
        "start.gg devolvió datos que JABS no pudo interpretar de forma segura.",
      graphql:
        "start.gg rechazó la solicitud del bracket. Revisa los datos del torneo seleccionado y los permisos.",
    },
  },
} satisfies LocaleCatalog;
