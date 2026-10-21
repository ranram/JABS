import type { LocaleCatalog } from './en';
export const es419 = {
  // Common labels and actions
  common: {
    language: 'Idioma',
    // Language choices
    languages: { en: 'English', es419: 'Español (Latinoamérica)' },
    // Common actions
    actions: {
      copy: 'Copiar',
      close: 'Cerrar',
      cancel: 'Cancelar',
      done: 'Listo',
      previous: 'Anterior',
      next: 'Siguiente',
      resetScores: 'Reiniciar marcadores',
      swapPlayers: 'Intercambiar jugadores',
      select: '---- Seleccionar ----'
    },
    // Status labels
    status: {
      live: 'En vivo',
      sending: 'Enviando',
      loading: 'Cargando…',
      reconnecting: 'Reconectando',
      ready: 'Listo',
      working: 'Procesando',
      pending: 'Pendiente',
      completed: 'Completado',
      onStream: 'En stream'
    },
    // Match details
    match: {
      bestOf: 'Mejor de {{count}}',
      firstTo: 'Primero en llegar a {{count}}',
      topanga: 'Reglas Topanga',
      topangaDescription:
        'Gana quien llegue primero a 7 victorias con dos de ventaja. Al llegar a 10 victorias, gana sin importar la ventaja.',
      seed: 'Seed {{seed}}',
      set: 'Set {{id}}',
      stream: 'Stream',
      versus: 'vs.',
      finalScore: 'Marcador final: {{one}} - {{two}}'
    },
    // Media folders
    mediaFolder: {
      open: 'Abrir carpeta',
      openHint: 'Abre esta carpeta de medios en el explorador de archivos.',
      openFailed: 'JABS no pudo abrir la carpeta de medios.'
    },
    pagination: 'Página {{page}} de {{totalPages}}'
  },
  // OBS overlays
  overlay: {
    invalidTitle: 'URL de overlay no válida',
    invalidBody:
      'Usa /overlay/active/main, /overlay/active/winner, /overlay/active/versus, /overlay/active/stats?player=1, /overlay/active/top-eight-matchups, /overlay/commentators, /overlay/active/bracket o una ruta fija de juego compatible.',
    waiting: 'Esperando una partida…',
    broadcastInformation: 'Información de stream',
    winnerAnnouncement: 'Ganador',
    championAnnouncement: 'Campeón',
    stats: {
      title: 'Estadísticas del jugador',
      recentPlacements: 'Resultados recientes',
      currentRun: 'Recorrido actual',
      loading: 'Cargando resultados del torneo…',
      unavailable: 'Los resultados no están disponibles. Reintentando…',
      placementsUnavailable: 'No se pudieron cargar los resultados recientes. Reintentando…',
      runUnavailable: 'No se pudo cargar el recorrido del torneo. Reintentando…',
      incompleteRun: 'No se pudieron cargar algunas partidas. Reintentando…',
      noMatches: 'Aún no hay partidas terminadas',
      linkProfile: 'Vincula un perfil de start.gg para mostrar resultados recientes.',
      chooseTournament: 'Envía una partida de torneo a Stream para mostrar su recorrido.',
      invalidPlayer: 'Usa ?player=1 o ?player=2 en la URL de estadísticas.',
      runPage: 'Partidas {{first}}–{{last}} de {{total}}'
    },
    // Top 8 Matchups
    topEightMatchups: {
      title: 'Enfrentamientos del Top 8',
      winners: 'Ganadores',
      losers: 'Perdedores',
      loading: 'Cargando enfrentamientos del Top 8…'
    },
    versus: {
      upcomingMatch: 'Próximo enfrentamiento',
      location: 'Ubicación {{country}}',
      locationUnknown: 'Ubicación desconocida',
      representing: 'Representando a {{sponsor}}',
      stats: { age: 'Edad', sponsor: 'Patrocinador', seed: 'Seed', nickname: 'Apodo' },
      headToHead: 'Cara a cara',
      noHeadToHead: 'No se encontraron enfrentamientos',
      noPlacements: 'No se encontraron posiciones recientes',
      win: 'W',
      loss: 'L'
    },
    playerScore: 'Marcador de {{player}}: {{score}}'
  },
  // Operator interface
  operator: {
    support: {
      title: 'Diagnóstico y soporte',
      description: 'Cuéntanos qué pasó y cuándo. Exporta un informe y adjúntalo a tu correo.',
      export: 'Exportar informe',
      openFolder: 'Abrir carpeta de registros',
      desktopOnly: 'Los registros están disponibles en la aplicación de escritorio de JABS.',
      privacy: 'Los informes no incluyen tokens, datos de jugadores ni ajustes guardados. Nada se envía automáticamente.',
      copyEmail: 'Copiar correo',
      copied: 'Correo de soporte copiado.',
      failed: 'JABS no pudo completar esta acción. Inténtalo de nuevo.'
    },
    help: {
      title: 'Ayuda',
      tutorials: 'Tutoriales',
      supportDevelopment: 'Apoya a JABS en Ko-fi',
      next: 'Siguiente',
      previous: 'Atrás',
      done: 'Listo',
      close: 'Cerrar guía',
      progress: '{{current}} de {{total}}',
      missing: 'Completa los pasos anteriores para que aparezca esta sección. Puedes volver atrás o continuar.',
      failed: 'No se pudo abrir esta guía. Inténtalo de nuevo desde Ayuda.',
      tokenLink: 'Abrir las instrucciones de tokens de start.gg',
      guides: {
        tournament: 'Organizar un torneo',
        exhibition: 'Preparar una exhibición',
        topEight: 'Crear una imagen de Top 8',
        thumbnail: 'Crear una miniatura de YouTube',
        tokens: 'Conectar un token de start.gg',
        library: 'Usar la biblioteca de jugadores',
        media: 'Mover y ajustar imágenes',
        scoreboard: 'Crear un marcador personalizado',
        stingers: 'Configurar stingers'
      },
      steps: {
        tournament: {
          title: 'Carga tu torneo',
          body: 'Pega el enlace del torneo de start.gg y elige Cargar eventos. Los torneos públicos funcionan sin token.'
        },
        event: {
          title: 'Elige un evento',
          body: 'Selecciona el evento que vas a organizar. Los filtros de fase, grupo y estación ayudan a reducir la lista de partidas.'
        },
        sets: {
          title: 'Envía una partida a transmisión',
          body: 'Busca los jugadores o la ronda y abre una partida. Elige Enviar a transmisión para cargarla en los overlays.'
        },
        stream: {
          title: 'Prepara la partida',
          body: 'Revisa nombres, personajes, banderas y formato. JABS comprueba y guarda tus cambios antes de actualizar OBS.'
        },
        obs: {
          title: 'Conecta OBS',
          body: 'Copia una URL de este menú y agrégala como Fuente de navegador de 1920×1080 en OBS. Mantén JABS abierto durante la transmisión. Para repetir la animación de entrada al volver a la escena, marca “Apagar fuente cuando no sea visible” y “Actualizar el navegador cuando la escena se active”. Deja ambas opciones sin marcar para Stingers.'
        },
        exhibition: {
          title: 'Empieza sin un torneo',
          body: 'Si hay un torneo cargado, usa Bracket → Opciones → Cerrar torneo primero. Esto limpia la partida en transmisión para preparar una exhibición.'
        },
        game: {
          title: 'Elige el juego',
          body: 'Elige el juego en Editar estado de transmisión para establecer las reglas y las imágenes disponibles. Puedes elegir otro estilo de marcador.'
        },
        players: {
          title: 'Elige los jugadores',
          body: 'Escribe los tags o elige jugadores de las sugerencias y selecciona sus personajes y atuendos. Al elegir jugadores guardados, se completan sus datos y puedes consultar su historial de enfrentamientos.'
        },
        scores: {
          title: 'Lleva el marcador local',
          body: 'Actualiza el marcador al terminar cada juego. Las exhibiciones incluyen formatos primero a y Reglas Topanga. Los cambios locales son independientes del reporte a start.gg.'
        },
        topEight: {
          title: 'Prepara una imagen de Top 8',
          body: 'Elige un juego, el nombre del torneo y el título. Carga los resultados finales de start.gg o llena los puestos a mano.'
        },
        assets: {
          title: 'Agrega tus imágenes',
          body: 'Abre una carpeta desde Recursos. Nombra los archivos según el jugador, patrocinador o personaje y elige Recargar recursos.'
        },
        placements: {
          title: 'Completa los puestos',
          body: 'Revisa los ocho jugadores, patrocinadores, personajes, atuendos y banderas. Puedes elegir jugadores guardados entre las sugerencias de nombres.'
        },
        topEightExport: {
          title: 'Ajusta y exporta',
          body: 'Arrastra las imágenes en la vista previa para encuadrar a cada jugador y descarga el PNG de 1920×1080. La exportación usa tus imágenes originales.'
        },
        thumbnail: {
          title: 'Prepara una miniatura',
          body: 'Elige un juego, el nombre del torneo y el título. Usa la partida en transmisión o ingresa tus propios jugadores.'
        },
        thumbnailPlayers: {
          title: 'Configura ambos jugadores',
          body: 'Elige el nombre, patrocinador, personaje, atuendo y bandera de cada jugador. Si eliges uno guardado, se completan los datos que ya habías configurado.'
        },
        thumbnailExport: {
          title: 'Encuadra la miniatura',
          body: 'Acomoda las imágenes en la vista previa y descarga el PNG de 1280×720. El arte de personajes y las fotos se pueden mover por separado.'
        },
        tokenPurpose: {
          title: 'Cuándo necesitas un token',
          body: 'Los torneos públicos y los controles locales de OBS funcionan sin token. Agrega uno para reportar resultados o navegar con tu cuenta.'
        },
        tokenCreate: {
          title: 'Crea un token de start.gg',
          body: 'Sigue las instrucciones oficiales de abajo para crear un token en Developer Settings de start.gg. Cópialo cuando aparezca y pégalo en Acceso a la API.'
        },
        tokenStorage: {
          title: 'Guarda el token o úsalo por esta sesión',
          body: 'Guardar token usa el almacenamiento seguro del sistema operativo. Si no está disponible, Usar durante la sesión lo conserva en memoria hasta cerrar JABS.'
        },
        reporting: {
          title: 'Reportar requiere permiso',
          body: 'Tu cuenta de start.gg debe tener permiso para reportar en el torneo. JABS pide confirmación y verifica la partida actual antes de enviar el resultado.'
        },
        library: {
          title: 'Abre Jugadores',
          body: 'Guarda los datos de tus jugadores y sus personajes habituales para usarlos en futuras partidas. Elige Siguiente para abrir Jugadores.'
        },
        libraryFind: {
          title: 'Agrega un jugador',
          body: 'Busca un perfil de start.gg, agrega un jugador local o usa uno que ya esté en transmisión. Importar jugadores del evento, junto al selector de evento, permite agregar los participantes de un torneo.'
        },
        librarySelect: {
          title: 'Encuentra un jugador guardado',
          body: 'Busca en la lista y selecciona un jugador para editarlo. Sus perfiles de start.gg ayudan a distinguir a quienes usan el mismo tag.'
        },
        libraryDefaults: {
          title: 'Guarda la configuración de un jugador',
          body: 'Configura personajes, atuendos y encuadre de fotos por juego y elige Guardar jugador. En Editar estado de transmisión, los cambios de banderas, pronombres, redes y personajes de jugadores guardados se guardan automáticamente.'
        },
        libraryBackup: {
          title: 'Respalda tu biblioteca',
          body: 'Exportar biblioteca guarda tus jugadores y su configuración en un archivo JSON. Las imágenes quedan en sus carpetas. Importar biblioteca agrega jugadores sin reemplazar los registros que ya tienes.'
        },
        media: {
          title: 'Trabaja en la vista previa',
          body: 'Cuando las imágenes carguen, haz clic en una para seleccionarla. El modo Personaje + foto comienza con el personaje detrás de la foto.'
        },
        mediaSelect: {
          title: 'Selecciona cualquiera de las imágenes',
          body: 'Haz clic en una parte visible para seleccionarla. Las zonas transparentes dejan pasar a la otra imagen; Alt+clic selecciona la imagen que está detrás.'
        },
        mediaMove: {
          title: 'Mueve, cambia el tamaño y voltea',
          body: 'Arrastra para mover la imagen seleccionada. Las flechas la mueven, Shift + flechas aumenta la distancia, + / − cambia el tamaño y F la voltea.'
        },
        mediaReset: {
          title: 'Restablece una imagen',
          body: 'Elige Restablecer posición para recuperar la posición, el tamaño y la orientación de la imagen seleccionada. La otra imagen conserva sus ajustes.'
        },
        scoreboard: {
          title: 'Importa un marco de marcador',
          body: 'Elige un PNG transparente cercano a 1920×1080, escribe un nombre e impórtalo. El marco puede pesar hasta 20 MB.'
        },
        scoreboardLayout: {
          title: 'Ubica los campos en vivo',
          body: 'Elige un diseño guardado y haz clic o selecciona un campo para moverlo. Alt+clic alcanza campos superpuestos. Las flechas mueven un campo; Shift lo mueve 10 píxeles.'
        },
        scoreboardRails: {
          title: 'Agrega extras de transmisión',
          body: 'Activa los rieles izquierdo, central y derecho en el editor. Los laterales muestran tu texto de transmisión; el central, los datos de la partida.'
        },
        scoreboardSave: {
          title: 'Los diseños se guardan automáticamente',
          body: 'Los cambios se guardan automáticamente; el indicador junto al título muestra si ya se guardaron. Elige Usar en OBS para mostrar el diseño en la transmisión.'
        },
        stingers: {
          title: 'Elige tus clips',
          body: 'Agrega videos Perfect y Winner en formato WebM. Winner puede reproducirse automáticamente cuando el marcador completa la partida.'
        },
        stingerFraming: {
          title: 'Encuadra al ganador',
          body: 'Usa la vista previa para revisar la foto, el personaje y la franja del nombre. Define cuándo aparecen los recursos en el clip; esta vista previa no activa OBS.'
        },
        stingerObs: {
          title: 'Agrega la fuente en OBS',
          body: 'Copia la URL de Stingers y agrégala como Fuente de navegador de 1920×1080 sobre las demás fuentes. Reutilízala entre escenas y comprueba que aparezca activa en JABS. Deja sin marcar “Apagar fuente cuando no sea visible” y “Actualizar el navegador cuando la escena se active” para que cambiar de escena no interrumpa la reproducción.'
        },
        stingerPlay: {
          title: 'Reproduce clips desde cualquier pestaña',
          body: 'Este menú permite reproducir los clips configurados o detenerlos. Winner requiere una partida con marcador completo. Reconectar fuente de OBS actualiza la conexión cuando hace falta.'
        }
      }
    },
    quickTools: {
      assets: 'Abrir carpeta de recursos',
      folders: 'Carpetas de recursos',
      playerPhotos: 'Fotos de jugadores',
      headshots: 'Retratos de jugadores',
      sponsors: 'Patrocinadores',
      logos: 'Logos de torneos',
      characters: 'Arte de personajes',
      portraits: 'Retratos de personajes',
      folderFailed: 'No se pudo abrir esta carpeta.',
      tools: 'Herramientas',
      bracketOptions: 'Opciones',
      presentation: 'Apariencia',
      moreDetails: 'Más detalles',
      playerDetails: 'Datos de jugadores',
      preview: 'Vista previa',
      download: 'Descargar PNG',
      loadingPreview: 'Actualizando vista previa…',
      enterPlayers: 'Ingresa los nombres de ambos jugadores.',
      broadcastExtras: 'Extras de transmisión',
      leftRail: 'Riel izquierdo',
      centerRail: 'Riel central',
      rightRail: 'Riel derecho',
      importNew: 'Importar un marcador nuevo',
      railsHelp: 'Los rieles laterales muestran tu texto de transmisión. El central muestra los datos de la partida.',
      clipSettings: 'Ajustes del ganador'
    },
    scoreboardPhotos: {
      side: 'Lado de la foto',
      unsupported: 'Este juego todavía no tiene un marco para fotos en el marcador.',
      recommendedSize: 'Recomendado: 512 × 512 px, de hombros a cabeza.',
      enabled: 'Fotos de jugadores en marcadores',
      logoBackdrop: 'Logo del torneo detrás de los jugadores',
      sponsorBackdrop: 'Logos de patrocinadores detrás de los jugadores',
      chooseLogo: 'Elige un logo de torneo en Extras de transmisión.',
      help: 'Prepara las fotos en <players>Jugadores</players>. Su ubicación depende del juego seleccionado. También funciona con marcadores personalizados.',
      preparation: 'Foto para el marcador',
      headshotsFolder: 'Retratos de jugadores',
      reload: 'Recargar imágenes',
      imageFailed: 'No se pudo cargar esta imagen. Revisa el archivo y recarga.',
      changed: 'Esta imagen cambió. Revisa el encuadre antes de confirmar.',
      confirmImage: 'Usar imagen actual',
      reset: 'Restablecer encuadre',
      saveFailed: 'No se pudo guardar la configuración de fotos. Recarga e inténtalo de nuevo.',
      loadFailed: 'No se pudo cargar la configuración de fotos.',
      noImage: 'No hay una imagen coincidente.'
    },
    appSubtitle: 'Just Another Bracketing System',
    // Player library
    players: {
      // Library navigation
      title: 'Jugadores',
      add: 'Agregar jugador',
      closePlayer: 'Cerrar jugador',
      search: 'Buscar tags y alias',
      searchPlaceholder: 'Escribe el tag de un jugador…',
      count: '{{count}} jugadores guardados',
      localPlayer: 'Jugador local',
      gameCount: 'Juegos: {{count}}',
      noMatches: 'No se encontraron jugadores con esa búsqueda.',
      emptyLibrary: 'Tus jugadores guardados aparecerán aquí.',
      onStream: 'En stream',
      fromStream: 'Editar preferencias: {{name}}',
      newPlayer: 'Nuevo jugador',
      choosePlayer: 'Elige un jugador',
      choosePlayerHelp: 'Elige un jugador guardado para editar sus datos, o agrega uno nuevo.',

      // Player details and saved choices
      detailsHeading: 'Datos del jugador',
      identityHeading: 'Perfil vinculado e identificadores',
      localId: 'ID local',
      startggId: 'ID de jugador de start.gg',
      profile: 'Ver perfil de start.gg',
      useImported: 'Usar el valor importado',
      aliases: 'Otros tags',
      gamesHeading: 'Preferencias por juego',
      game: 'Preferencias por juego',
      chooseGameHelp: 'Elige un juego para guardar los personajes e ilustraciones de este jugador.',
      characters: 'Personajes, en orden de equipo',
      artwork: 'Ilustración del personaje',
      portrait: 'Retrato del personaje',
      clearGame: 'Borrar las preferencias de este juego',
      save: 'Guardar jugador',
      saved: 'Jugador guardado. Estas preferencias se usarán la próxima vez que lo cargues.',
      defaultsSaved: 'Preferencias guardadas para {{name}}.',
      defaultsModerated: 'Preferencias guardadas para {{name}}. Se bloqueó parte del texto.',
      defaultsSaveFailed: 'No se pudieron guardar las preferencias de {{name}}.',
      defaultsUnlinked: 'Este jugador no está en la biblioteca.',
      defaultsIdentityChanged: 'El jugador de start.gg vinculado cambió. Recarga su ficha e inténtalo de nuevo.',
      savedWithModeration: 'No se guardaron los cambios bloqueados en {{fields}}.',
      blockedTag: 'El tag del jugador contiene lenguaje bloqueado; escribe otro para guardar.',
      reload: 'Recargar ficha',
      delete: 'Eliminar jugador',
      deleted: 'Se eliminó al jugador de tu biblioteca.',
      confirmDelete: 'Confirmar eliminación',
      cancelDelete: 'Cancelar eliminación',
      unsaved: 'Cambios sin guardar',
      unsavedTitle: 'Cambios del jugador sin guardar',
      unsavedHelp: 'Guarda o descarta los cambios antes de cerrar la ficha del jugador.',
      saveContinue: 'Guardar y continuar',
      discardContinue: 'Descartar cambios',
      keepEditing: 'Seguir editando',
      actionFailed: 'No se pudo completar esta acción en la biblioteca de jugadores.',
      searchFailed: 'No se pudo buscar en tu biblioteca de jugadores.',
      loadFailed: 'No se pudo cargar el jugador guardado. Puedes escribir su nombre.',
      assetsFailed: 'No se pudieron cargar las ilustraciones. Las preferencias guardadas siguen disponibles.',
      photoHelp:
        'Recomendado: 1024 × 1536 px (2:3), de cabeza a cintura. Escribe el nombre del archivo con su extensión para usar una foto específica.',
      nicknameHelp: 'Apodo para la transmisión, distinto de los alias de búsqueda.',
      overrideHelp:
        'Tus cambios se conservan cuando se actualizan los datos de start.gg. Deja un campo vacío para ocultar su valor importado.',
      fields: {
        name: 'Tag del jugador',
        prefix: 'Patrocinador / prefijo',
        xHandle: 'Usuario de X',
        pronouns: 'Pronombres',
        country: 'Código de país',
        state: 'Estado / región',
        age: 'Edad',
        nickname: 'Apodo',
        displayFlag: 'Bandera personalizada',
        playerPhotoAssetId: 'Archivo de foto del jugador'
      },

      // Event imports and library files
      lookupLabel: 'Agregar desde start.gg',
      lookupPlaceholder: 'URL del perfil o ID numérico del jugador',
      lookupHelp: 'También puedes pegar el código del perfil que aparece después de /user/.',
      lookup: 'Buscar jugador',
      lookupSaved: 'Se abrió la ficha guardada de {{name}}.',
      lookupImported: 'Se agregó a {{name}} desde start.gg.',
      export: 'Exportar biblioteca',
      importFile: 'Importar biblioteca',
      fileTooLarge: 'Elige un archivo de biblioteca de menos de 50 MB.',
      fileImported: 'Se agregaron {{added}} jugadores; se conservaron los {{skipped}} que ya estaban guardados.',
      importEvent: 'Importar jugadores del evento',
      stopImport: 'Detener importación',
      importStopped: 'Importación detenida. Los jugadores ya guardados permanecen en la biblioteca.',
      importProgress: 'Importando página {{page}} de {{total}}…',
      importDone: 'Importación completa. Se agregaron {{count}} jugadores y se actualizaron los perfiles existentes.',
      importFailed:
        'La importación se interrumpió. Los jugadores ya importados siguen guardados. Puedes volver a intentarlo.'
    },

    // Global broadcast appearance and portable presets
    appearance: {
      settings: 'Configuración',
      loading: 'Cargando configuración…',
      bracketNames: 'Nombres del bracket',
      bracketNamesHelp:
        'Usa los nombres de tu comunidad para los encabezados. Los campos vacíos usan los nombres habituales; las rondas conservan sus nombres de start.gg.',
      colorOverride: 'Usar colores personalizados',
      primaryColor: 'Color principal',
      secondaryColor: 'Color secundario',
      colorHelp:
        'Al desactivar esta opción, vuelven los colores del estilo elegido. Las imágenes que agregaste conservan sus colores originales.',
      textSize: 'Tamaño del texto en overlays',
      defaultText: 'Normal',
      largeText: 'Más grande',
      broadcastLanguage: 'Idioma de OBS',
      followLanguage: 'El mismo que JABS',
      animations: 'Animar la entrada de los overlays',
      presets: 'Apariencias guardadas',
      savedPreset: 'Apariencia guardada',
      choosePreset: 'Elige una apariencia',
      presetName: 'Nombre de la apariencia',
      savePreset: 'Guardar apariencia',
      updatePreset: 'Actualizar apariencia',
      deletePreset: 'Eliminar apariencia',
      importPreset: 'Importar apariencia',
      exportPreset: 'Exportar apariencia actual',
      presetHelp:
        'Se guardan los colores, los nombres del bracket, el tamaño del texto, el idioma y la opción de animaciones. Al importar una apariencia, se aplica de inmediato. Puedes guardar hasta 20.',
      restoreDefaults: 'Restablecer valores',
      restoreHelp: 'Vuelve a la apariencia inicial y conserva tus apariencias guardadas.',
      defaultPresetName: 'Mi stream',
      importFailed: 'No se pudo importar la apariencia',
      importHelp: 'Elige un archivo JSON de apariencia de JABS exportado desde Configuración.',
      exportFailed: 'No se pudo exportar la apariencia',
      tryAgain: 'Inténtalo de nuevo cuando termine de guardarse la configuración.',
      startingRound: 'Ronda inicial de {{bracket}}'
    },
    // Bracket OBS screen
    bracketScreen: {
      headingLabel: 'Título del encabezado',
      eventLabel: 'Nombre del evento',
      title: 'Bracket',
      winners: 'Ganadores',
      losers: 'Perdedores',
      loading: 'Cargando configuración del bracket…',
      winnersRounds: 'Ronda inicial de ganadores',
      losersRounds: 'Ronda inicial de perdedores',
      autoRounds: 'Automático',
      loadingPools: 'Cargando pools…',
      refresh: 'Actualizar bracket',
      refreshHelp:
        'Los pools activos se actualizan cada minuto. Los terminados solo se actualizan cuando lo solicitas.',
      chooseScope: 'Elige una fase y un pool para mostrar el bracket.',
      waiting: 'Cargando el pool seleccionado…',
      noMatches: 'Este pool todavía no tiene partidas publicadas.',
      failed: 'No se pudo actualizar el bracket',
      winnerOf: 'Ganador: {{round}}',
      loserOf: 'Perdedor: {{round}}',
      tbd: 'Por definir',
      bye: 'Bye'
    },

    // Header and connection status
    topbar: {
      onStream: 'En transmisión',
      loadingState: 'Cargando estado…',
      apiVerified: 'API verificada',
      sessionToken: 'Token de sesión',
      tokenStored: 'Token guardado',
      sessionMode: 'Modo de sesión',
      needsToken: 'Requiere token'
    },

    // App updates
    updates: {
      check: 'Buscar actualizaciones',
      updateNow: 'Actualizar ahora',
      restart: 'Reiniciar ahora',
      title: 'Actualizar JABS',
      current: 'JABS está actualizado.',
      available: 'La versión {{version}} está disponible.',
      confirm: '¿Actualizar JABS de {{current}} a {{next}}?',
      installRestart: 'Instalar y reiniciar',
      restartNotice:
        'JABS se reiniciará. Las fuentes de OBS se desconectarán por un momento. Exporta cualquier gráfico pendiente antes de actualizar.',
      finishEditing:
        'Termina de editar y espera a que se guarden los cambios o se envíen los resultados antes de actualizar.',
      downloading: 'Descargando actualización…',
      installing: 'Instalando actualización…',
      restarting: 'Reiniciando JABS…',
      installed: 'La actualización está instalada. Reinicia JABS para terminar.',
      development: 'Las actualizaciones están disponibles en las versiones instaladas.',
      unavailable: 'Las actualizaciones no están disponibles en esta versión.',
      packageManager:
        'Actualiza este paquete de Linux con tu gestor de paquetes. La AppImage permite actualizar desde JABS.',
      supportFailed: 'No se pudo cargar la configuración de actualización. Reinicia JABS e inténtalo de nuevo.',
      checkFailed: 'No se pudieron buscar actualizaciones. Revisa tu conexión a internet e inténtalo de nuevo.',
      installFailed: 'No se pudo instalar la actualización. Inténtalo de nuevo.',
      restartFailed:
        'La actualización está instalada, pero JABS no pudo reiniciarse. Inténtalo de nuevo o cierra y vuelve a abrir JABS.'
    },

    // Workspace navigation and overlay settings
    stingers: {
      loadFailed: 'No se pudieron cargar los stingers.',
      activateSource: 'Coloca la fuente de navegador Stingers en tu escena activa de OBS.',
      loading: 'Cargando stingers…',
      failed: 'No se pudieron actualizar los stingers.',
      retry: 'Reintentar',
      reconnect: 'Reconectar fuente de OBS',
      perfect: 'Perfect',
      winner: 'Ganador',
      video: 'Video',
      chooseVideo: 'Elegir un video WebM',
      webmOnly: 'Elige un video WebM. Convierte otros formatos antes de importarlos.',
      audioHelp: 'Administra el sonido con Controlar audio vía OBS en las propiedades de la fuente de navegador.',
      formats: 'WebM · Video VP8/VP9, audio Opus/Vorbis opcional · Hasta 256 MB.',
      useDuration: 'Limitar la duración',
      duration: 'Duración (segundos)',
      playBroadcast: 'Reproducir en OBS',
      playClip: 'Reproducir {{name}}',
      playingClip: 'Reproduciendo: {{name}}',
      queuedClip: 'Iniciando: {{name}}',
      configure: 'Configurar stingers',
      noClips: 'Aún no hay videos configurados.',
      unavailable: 'Esperando la conexión de stingers.',
      preview: 'Vista previa aquí',
      remove: 'Quitar video',
      stopBroadcast: 'Detener en OBS',
      stopPreview: 'Detener vista previa',
      readySources_one: '{{count}} fuente activa en OBS',
      readySources_other: '{{count}} fuentes activas en OBS',
      sourceHelp:
        'Coloca esta fuente de navegador de 1920×1080 sobre las demás. Reutiliza la misma fuente en tus escenas.',
      automaticWinner: 'Reproducir Ganador al completar el marcador del set',
      automaticHelp: 'Las correcciones del marcador y las reconexiones no repiten la celebración.',
      currentWinner: 'Ganador actual: {{name}}',
      noWinner: 'Completa el marcador del set para reproducir Ganador.',
      mediaDelay: 'Mostrar los recursos del ganador después de (segundos)',
      layer: 'Posición del video',
      behind: 'Detrás de los recursos del ganador',
      inFront: 'Delante de los recursos del ganador (video transparente)',
      framing: 'Encuadre del ganador · 1920×1080',
      framingHelp: 'Prepara tu animación alrededor de estas regiones fijas. Esta vista previa no activa OBS.',
      previewPlayer: 'Jugador de vista previa',
      playerOne: 'Jugador 1',
      playerTwo: 'Jugador 2',
      photo: 'Foto del jugador',
      character: 'Arte del personaje',
      name: 'Nombre del jugador',
      tooLarge: 'Elige un video de hasta 256 MB.',
      playbackFailed: 'No se pudo reproducir este video. Revisa su códec y prueba otra exportación.'
    },
    workspaces: {
      stingers: 'Stingers',
      aria: 'Espacios de trabajo de JABS',
      bracket: 'Gestión de bracket',
      customScoreboard: 'Marcador personalizado',
      otherOverlays: 'Overlays',
      topEight: 'Generador de Top 8',
      thumbnail: 'Generador de miniaturas de YouTube',
      otherOverlaysTitle: 'Overlays para OBS',
      obsSource: 'Fuente de navegador de OBS',
      resolvingObs: 'Cargando la URL de OBS…',
      winnerAutomatic: 'Una sola fuente de OBS muestra automáticamente al ganador del set o al campeón del torneo.',
      styling: 'Estilo',
      transparentBackground: 'Fondo transparente',
      playerStats: {
        loading: 'Cargando ajustes de estadísticas…',
        sharedSettings: 'Ajustes compartidos para Jugador 1 y Jugador 2',
        liveStyle: 'Usar estilo de la partida en vivo',
        showTournamentLogo: 'Mostrar logo del torneo',
        showPlacementLogos: 'Mostrar logos de torneos en los resultados',
        showSponsorLogo: 'Mostrar logo del equipo o patrocinador',
        showPlayerPhoto: 'Mostrar foto del jugador',
        showCharacter: 'Mostrar personaje',
        failedTitle: 'No se pudieron actualizar las estadísticas',
        failed: 'No se pudieron guardar los ajustes de estadísticas.'
      },
      // Commentator settings
      commentator: {
        swap: 'Intercambiar comentaristas',
        loading: 'Cargando presentación de comentaristas…',
        tournament: 'Nombre del torneo',
        logo: 'Logo del torneo centrado',
        person: 'Comentarista {{count}}',
        name: 'Nombre al aire',
        handle: 'Red social',
        presentTimed: 'Presentar por 10 segundos',
        showPersistent: 'Dejar en pantalla',
        hide: 'Ocultar overlay',
        timed: 'Los comentaristas aparecerán y desaparecerán durante 10 segundos.',
        persistent: 'Los comentaristas permanecerán visibles.',
        hidden: 'Presentación de comentaristas oculta.',
        failedTitle: 'No se pudo actualizar el overlay de comentaristas',
        failed: 'No se pudo actualizar el overlay de comentaristas.'
      },
      // Winner and Champion settings
      resultScreen: {
        showTextBackdrop: 'Fondo del texto',
        composition: 'Composición',
        classic: 'Clásica',
        victory: 'Victoria',
        spotlight: 'Protagonista',
        loading: 'Cargando ajustes…',
        currentWinner: 'Ganador actual',
        winner: 'Ganador del set',
        champion: 'Campeón',
        noWinner: 'Completa el set para mostrar al ganador',
        showTournamentLogo: 'Mostrar logo del torneo',
        showPlayerPhoto: 'Mostrar foto del jugador',
        showSponsorLogo: 'Mostrar logo del equipo/patrocinador',
        showCharacter: 'Mostrar personaje',
        unavailableForWinner: 'No se encontró una imagen.',
        failedTitle: 'No se pudo actualizar la pantalla de ganador y campeón',
        failed: 'No se pudo actualizar la presentación de ganador y campeón.'
      },
      // Overlay descriptions
      tools: {
        playerStats: {
          title: 'Estadísticas del jugador',
          description:
            'Muestra a cualquiera de los dos jugadores en vivo con cinco resultados recientes y su recorrido en el torneo actual.'
        },
        versus: {
          title: 'Pantalla versus',
          description:
            'Presenta una exhibición o una partida de torneo con resultados recientes e historial de enfrentamientos.',
          next: 'Elige un juego para la exhibición en Editar estado de transmisión, o envía un set de torneo al stream.'
        },
        winner: {
          title: 'Pantalla de ganador y campeón',
          description:
            'Celebra al ganador del set o campeón del torneo con arte, foto y logo de equipo/patrocinador opcionales.'
        },
        commentators: {
          title: 'Vista de comentaristas',
          description: 'Presenta dos comentaristas al aire y sus redes sociales.'
        },
        topEightMatchups: {
          title: 'Enfrentamientos del Top 8',
          description:
            'Presenta los dos enfrentamientos iniciales de ganadores y los dos de perdedores con un retrato por jugador.'
        },
        bracket: {
          title: 'Vista del bracket',
          description:
            'Muestra un pool seleccionado con rondas de ganadores y perdedores, marcadores y banderas de jugadores.'
        }
      },
      // Graphic generator descriptions
      generators: {
        topEight: {
          title: 'Generador de Top 8',
          description: 'Crea un gráfico de Top 8 con arte de personajes o fotos de jugadores.',
          emptyState: 'Elige un juego y completa las posiciones para crear un gráfico de Top 8.'
        },
        thumbnail: {
          title: 'Generador de miniaturas de YouTube',
          description: 'Crea una miniatura de YouTube con tus propias imágenes y fondo.',
          emptyState: 'Elige un juego e ingresa a ambos jugadores para crear una miniatura.'
        }
      },
      // Versus Screen settings
      versusScreen: {
        showMatchBackdrop: 'Fondo de la información de la partida',
        matchBackdropHelp: 'Las filas de comparación e historial conservan su fondo.',
        statsHeading: 'Comparación de jugadores',
        statsHelp:
          'Elige los datos en el orden que quieras mostrarlos. Si uno ya está en uso, se intercambian las filas. Los apodos aparecen cuando ambos jugadores tienen uno guardado en Jugadores.',
        statRow: 'Fila {{number}}',
        hiddenRow: 'Oculta',
        showHeadToHead: 'Mostrar enfrentamientos recientes',
        startgg: 'Historial de enfrentamientos en start.gg',
        noSet: 'No hay una partida preparada',
        livePreview: 'Vista previa',
        refreshHistory: 'Actualizar historial de estos jugadores',
        historyUpdated: 'Historial actualizado',
        historyUpdatedHelp: 'Se cargaron los enfrentamientos desde start.gg.',
        historyLoading: 'Cargando historial de enfrentamientos…',
        historyFailed: 'No se pudo actualizar el historial. Puedes seguir con la partida e intentarlo de nuevo.',
        historyEntries: 'resultados cargados',
        startggProfileError: 'Elige un juego y vincula a ambos jugadores con sus perfiles de start.gg.',
        obsCurrent: 'OBS está actualizado',
        obsPending: 'OBS se actualizará en 1 segundo…',
        loadingScreenSettings: 'Cargando configuración de la pantalla versus…'
      }
    },

    // Utility groups
    utilityGroups: { moderation: 'Moderación', media: 'Recursos', bracket: 'Bracket', obs: 'OBS' },

    // start.gg connection and bracket browser
    startgg: {
      publicAccess: 'Consulta pública',
      publicHelp:
        'Consulta torneos públicos y controla tus overlays sin token. Agrega uno para reportar resultados a start.gg.',
      reportToken:
        'Agrega un token de start.gg para reportar resultados. Puedes seguir editando tu overlay localmente.',
      title: 'Bracket de start.gg',
      description: 'Conecta, carga un evento y elige el siguiente set para stream.',
      verified: 'Verificado',
      session: 'Sesión',
      stored: 'Guardado',
      offline: 'Sin conexión',
      apiAccess: 'Acceso a la API',
      tokenLocal: 'JABS envía tu token solo a la API de desarrolladores de start.gg.',
      sessionStorage:
        'El almacenamiento seguro de credenciales no está disponible. Puedes usar un token hasta cerrar JABS sin guardarlo en el disco.',
      tokenPlaceholder: 'Pega el token de start.gg',
      saveToken: 'Guardar token',
      useForSession: 'Usar durante la sesión',
      removeToken: 'Eliminar token',
      tournament: 'Torneo',
      tournamentPlaceholder: 'Slug del torneo o URL de start.gg',
      loadEvents: 'Cargar eventos',
      unloadTournament: 'Cerrar torneo',
      unloadTournamentHint:
        'Quita el torneo cargado, los filtros, el selector de sets y el estado activo de la transmisión.',
      recent: 'Recientes',
      recentAria: 'Torneos recientes',
      clearCache: 'Borrar historial del bracket',
      clearCacheHint: 'Limpia el selector de sets y el historial de torneos recientes.',
      activeStateStays: 'La partida en stream se mantiene.',
      detectedProfile: 'Perfil de juego detectado',
      eventAria: 'Evento del torneo',
      selectEvent: 'Selecciona un evento'
    },

    // Bracket browsing
    browser: {
      selectEvent: 'Selecciona un evento para recargar el bracket.',
      updatedAt: 'Bracket actualizado: {{time}}',
      gameProfile: 'Perfil de juego para el set',
      assetSlug: 'Carpeta de recursos de personajes:',
      reloadAssets: 'Recargar recursos',
      reloadAssetsHint: 'Busca de nuevo ilustraciones, fotos y logos locales.',
      assetsReloaded:
        'Recursos recargados · Arte de personajes: {{characterArt}} · Retratos: {{characterPortraits}} · Logos de torneos: {{tournamentLogos}} · Logos de patrocinadores: {{sponsorLogos}} · Fotos de jugadores: {{playerPhotos}}',
      logosReloaded: 'Se encontraron {{count}} logo(s) de torneo.',
      assetsReloadFailed: 'No se pudieron recargar los catálogos locales de recursos.',
      chooseProfile: 'Elige un perfil de juego',
      detectedFromEvent: 'Detectado del evento: {{profile}}',
      unknownGame: 'Este juego usa un perfil de overlay existente. Puedes cambiarlo aquí; el nombre del juego y sus imágenes se conservan.',
      phase: 'Fase',
      allPhases: 'Todas las fases',
      pool: 'Pool / grupo de fase',
      allPools: 'Todos los pools de la fase',
      stationNumber: 'Estación',
      stationPlaceholder: 'p. ej., 3',
      browse: 'Explorar',
      poolPages: 'Páginas de pools',
      allEventSets: 'Todos los sets del evento',
      refresh: 'Actualizar selector de sets',
      refreshHint: 'Obtiene los sets más recientes para los filtros actuales.'
    },

    // Set selection and filters
    selector: {
      open: 'Seleccionar set',
      pillFilters: 'Filtrar por:',
      pillFiltersHelp:
        'Los filtros se aplican a los sets cargados. Desplázate para cargar más o busca para cargar todas las páginas.',
      statusFilter: 'Estado',
      stationFilter: 'Estación',
      streamFilter: 'Transmisión asignada',
      clearFilters: 'Quitar filtros',
      noFilterMatch: 'Ningún set cargado coincide con estos filtros.',
      streamRefreshFailed:
        'No se pudieron actualizar las transmisiones asignadas. Se siguen mostrando las cargadas anteriormente.',
      title: 'Seleccionar set',
      view: 'Vista de {{scope}}',
      total: '{{count}} en total',
      bracketOrder: 'orden del bracket de start.gg',
      dirtyWarning: 'Los cambios del estado de transmisión se están guardando automáticamente.',
      search: 'Buscar sets',
      searchPlaceholder: 'Jugador, ronda, estación o ID del set',
      loadingAll: 'Cargando todas las páginas del bracket para buscar…',
      searchProgress:
        'Buscando en todo el bracket · página {{loaded}} de {{total}}. Los resultados aparecen al encontrarlos.',
      scanningFor: 'Buscando “{{query}}” en las páginas restantes del bracket…',
      searchAll: 'La búsqueda abarca los {{count}} sets de esta vista.',
      focusSearch: 'Escribe una búsqueda para cargar partidas de todas las páginas.',
      searchView: 'La búsqueda abarca toda esta vista.',
      regionAria: 'Sets cargados del torneo',
      loadingSets: 'Cargando sets…',
      loadingMore: 'Cargando más sets',
      scrollMore: 'Desplázate para cargar más',
      allLoaded: 'Todos los sets están cargados',
      none: 'No se encontraron sets en esta vista.',
      noMatch: 'Ningún set de esta vista coincide con “{{query}}”.',
      tbd: 'Por definir',
      winner: 'Ganador',
      loser: 'Perdedor',
      setPages: 'Páginas de sets',
      streamAssignment: '{{platform}} · {{name}}',
      streamPlatforms: { youtube: 'YouTube', twitch: 'Twitch', stream: 'Transmisión' },
      scope: {
        event: 'Evento',
        phase: 'Fase',
        pool: 'Pool',
        station: 'Estación {{number}}'
      }
    },

    // Stream match editor
    editor: {
      enableShortcuts: 'Activar atajos de teclado',
      selectMatch: 'Selecciona un set de start.gg antes de recargarlo.',
      waitSave: 'Espera a que se guarden los cambios antes de usar estos controles.',
      waitAction: 'Espera a que termine la acción en curso.',
      title: 'Editar estado de transmisión',
      description: 'Los cambios se guardan automáticamente después de que JABS los comprueba y luego actualizan OBS.',
      unsaved: 'Sin guardar',
      savePending: 'Pendiente de guardar',
      saving: 'Actualizando OBS…',
      notSent: 'No enviado a OBS',
      gameProfile: 'Perfil de juego',
      detectedGame: 'Juego detectado',
      styling: 'Estilo del Scoreboard',
      scoreboardFont: 'Fuente del marcador',
      fontSettingsLoading: 'Cargando ajustes de fuente…',
      fontSettingsRetrying: 'Reconectando con los ajustes de fuente…',
      fontSaveFailed: 'No se pudo guardar la fuente del marcador. Inténtalo de nuevo.',
      stylingDescription:
        'Elige el diseño del marcador. Los personajes disponibles del juego siguen siendo los mismos.',
      detectedOverride: 'Detectado del evento: {{profile}}. Puedes cambiarlo después de cargar el set.',
      matchLength: 'Duración de la partida',
      displayName: 'Nombre visible',
      round: 'Ronda',
      roundPlaceholder: 'p. ej., Final de ganadores',
      station: 'Estación',
      stationPlaceholder: 'p. ej., Transmisión A',
      playerOne: 'Jugador 1',
      playerTwo: 'Jugador 2',
      save: 'Guardar estado de transmisión',
      discard: 'Descartar borrador',
      reload: 'Actualizar set actual',
      reloadHint:
        'Actualiza jugadores, marcadores, estado, datos del bracket e historial de Versus. Úsalo si un set sin jugar sigue apareciendo como completado después de restablecerlo en start.gg.',
      playerTag: 'Tag del jugador',
      prefix: 'Prefijo',
      character: 'Personaje',
      characters: 'Personajes',
      notShown: 'No mostrar',
      unavailableCharacter: 'No disponible: {{character}}',
      colorOutfit: 'Color / atuendo',
      defaultOutfit: 'Predeterminado',
      selectCharacterFirst: 'Selecciona primero un personaje',
      noExtraOutfits: 'No hay atuendos extra disponibles',
      xHandle: 'Usuario de x.com',
      state: 'Estado / provincia',
      chooseCountryFirst: 'Elige primero un país',
      pronouns: 'Pronombres',
      seed: 'Seed',
      country: 'País',
      displayFlag: 'Bandera mostrada',
      countrySearch: 'Buscar país, código ISO o bandera Pride'
    },

    // Broadcast details
    broadcast: {
      sharedLogoHelp: 'Usa el logo elegido aquí o, si no seleccionas uno, el de Extras de transmisión.',
      sponsorLogoHelp: 'Muestra el logo del equipo o patrocinador de cada jugador cuando esté disponible.',
      title: 'Extras de transmisión',
      enabled: '{{count}} activos',
      optional: 'Rieles y logo opcionales',
      showRails: 'Mostrar rieles informativos inferiores',
      leftRail: 'Riel izquierdo',
      leftPlaceholder: 'p. ej., !bracket · matcherino',
      rightRail: 'Riel derecho',
      rightPlaceholder: 'p. ej., twitch.tv/tucanal',
      showLogo: 'Mostrar logo del torneo / patrocinador',
      logo: 'Logo',
      useRailsLogo: 'Usar logo de los rieles',
      unavailableLogo: 'No disponible: {{logo}}',
      chooseLogo: 'Elige un logo',
      logoHint: 'Agrega archivos PNG, JPEG o WebP a Logos de torneos y elige Recargar recursos.',
      reloadLogos: 'Actualizar logos',
      playerPhotosFolder: 'Fotos de jugadores:',
      sponsorLogosFolder: 'Logos de patrocinadores:',
      tournamentLogosFolder: 'Logos de torneos:'
    },

    // Live match controls
    live: {
      title: 'Controles en vivo',
      dirtyWarning: 'Esperando a que terminen de guardarse los cambios de transmisión.',
      startggResult: 'Resultado de start.gg',
      report: 'Reportar resultado',
      winner: '{{winner}} gana {{winnerScore}}–{{loserScore}}.',
      historyReady: 'Historial de marcadores listo.',
      winnerOnly: 'Solo el ganador; se desconoce el orden de los juegos.',
      obsTitle: 'URLs de OBS',
      obsHelp:
        'Mantén JABS abierto mientras usas sus fuentes en OBS. Si una fuente queda en blanco, abre sus propiedades en OBS y elige Actualizar caché de la página actual.',
      resolvingObs: 'Cargando la URL de OBS…',
      copied: 'Copiado',
      copyObs: 'Copiar URL de overlay',
      copiedOverlay: 'URL copiada: {{overlay}}',
      overlayNames: {
        stingers: 'Stingers',
        score: 'Scoreboard',
        versus: 'Pantalla versus',
        'stats-player-1': 'Estadísticas: Jugador 1',
        'stats-player-2': 'Estadísticas: Jugador 2',
        winner: 'Ganador y campeón',
        champion: 'Campeón',
        'top-eight-matchups': 'Partidas del Top 8',
        commentators: 'Comentaristas',
        bracket: 'Bracket'
      },
      playerOnePoint: '+1 al jugador 1',
      subtractPlayerOnePoint: '−1 al jugador 1',
      playerTwoPoint: '+1 al jugador 2',
      subtractPlayerTwoPoint: '−1 al jugador 2'
    },

    // Set actions
    setActions: {
      closeAria: 'Cerrar acciones del set',
      send: 'Enviar a transmisión',
      sendHelp: 'Muestra los jugadores y los datos de esta partida en OBS.',
      quick: 'Actualización rápida de marcador',
      loading: 'Cargando set…',
      quickHelp: 'Registra y reporta esta partida sin alterar el set al aire.',
      alreadyComplete: 'Este set ya se muestra como completado en start.gg.',
      accepted: 'Aceptado por start.gg',
      streamUnchanged: 'La partida activa de transmisión no cambió.',
      bracketSet: 'Set del bracket',
      historyWarning:
        'Este set se cargó con marcador, pero sin historial de juegos. Para reportar el marcador exacto, reinícialo y registra cada juego en orden. De lo contrario, JABS solo puede reportar al ganador.',
      charactersFor: 'Personajes · {{player}}',
      characterHelp:
        'Elige los personajes antes de sumar la victoria del juego. Deja este campo vacío para no reportar ningún personaje.',
      mobileCharacterPrompt: 'Opcional: elige un personaje antes de agregar una victoria.',
      resultCheck: 'Comprobación del resultado',
      winner: '{{winner}} gana {{winnerScore}}–{{loserScore}}',
      reporting: 'Reportando…',
      confirm: 'Confirmar y actualizar bracket',
      safety:
        'JABS comprueba que start.gg no haya cambiado este set antes de enviarlo. Esto nunca reemplaza la partida mostrada en OBS.'
    },

    // Result reporting checks
    readiness: {
      alreadyComplete: 'Este set ya se muestra como completado en start.gg.',
      setMissing: 'Carga un set de start.gg antes de reportar un resultado.',
      exhibitionLocalOnly: 'Los marcadores de exhibición quedan en JABS y no se pueden reportar a start.gg.',
      entrantsMissing: 'Se requieren los ID de ambos participantes de start.gg para reportar un resultado.',
      scoreIncomplete:
        'Completa primero el marcador local. Este mejor de {{bestOf}} termina al llegar a {{target}} victorias.',
      historyMismatch:
        'El historial de juegos no coincide con el marcador en vivo. Corrige o reinicia el marcador antes de reportar.'
    },

    // Accessibility labels
    aria: {
      decreaseScore: 'Reducir marcador de {{player}}',
      increaseScore: 'Aumentar marcador de {{player}}'
    },

    // Custom scoreboard editor
    customScoreboard: {
      font: 'Fuente',
      sponsorColor: 'Color del patrocinador',
      flagSize: 'Tamaño de la bandera',
      title: 'Marcador personalizado',
      description:
        'Usa tu propio diseño transparente mientras JABS mantiene al día nombres, puntajes, banderas y datos de transmisión.',
      name: 'Nombre del marcador',
      image: 'PNG transparente del marcador',
      imageHelp:
        '1920×1080, hasta 20 MB. Si el ancho o el alto difieren por hasta 16 píxeles, la imagen se ajusta al tamaño.',
      import: 'Importar marcador',
      savedScoreboards: 'Marcadores guardados',
      none: '---- Seleccionar ----',
      loadFailed: 'JABS no pudo cargar los marcadores personalizados.',
      imageLoadFailed: 'JABS no pudo cargar la imagen de ese marcador. Intenta importarla de nuevo.',
      loadSetFirst: 'Envía un set a transmisión antes de elegir un marcador personalizado.',
      chooseFileAndName: 'Elige un PNG y escribe un nombre para el marcador.',
      imported: 'Marcador personalizado importado y seleccionado para OBS.',
      importFailed: 'JABS no pudo importar ese marcador.',
      saved: 'Diseño del marcador guardado.',
      saveFailed: 'JABS no pudo guardar el diseño del marcador.',
      deleteConfirm: '¿Eliminar “{{name}}”? Esta acción no se puede deshacer.',
      deleted: 'Marcador personalizado eliminado.',
      deleteFailed: 'JABS no pudo eliminar el marcador personalizado.',
      savedName: 'Nombre del diseño',
      adjustRegion: 'Campo seleccionado',
      mirrorToPlayer: 'Reflejar al jugador {{number}}',
      dragHelp:
        'Arrastra el texto o las imágenes para moverlos. Alt+clic alcanza campos superpuestos. Las flechas mueven; Mayús mueve 10 px.',
      keyboardCanvas: 'Área para posicionar el marcador personalizado',
      alignment: 'Alineación del texto',
      textColor: 'Color del texto',
      autosaveHelp: 'Los cambios se guardan automáticamente.',
      autosave: {
        saved: 'Cambios guardados',
        saving: 'Guardando diseño…',
        incomplete: 'Revisa los datos del diseño',
        error: 'Cambios sin guardar'
      },
      retry: 'Reintentar guardado',
      active: 'En uso',
      useInObs: 'Usar en OBS',
      useAutomatic: 'Usar estilos de JABS',
      delete: 'Eliminar marcador',
      regions: {
        playerOneFlag: 'Jugador 1 · Bandera',
        playerOneXHandle: 'Jugador 1 · Usuario de x.com',
        playerOneName: 'Jugador 1 · Patrocinador | nombre',
        playerOnePronouns: 'Jugador 1 · Pronombres',
        playerOneSeed: 'Jugador 1 · Seed',
        playerOneScore: 'Jugador 1 · Puntaje',
        playerTwoFlag: 'Jugador 2 · Bandera',
        playerTwoXHandle: 'Jugador 2 · Usuario de x.com',
        playerTwoName: 'Jugador 2 · Nombre | patrocinador',
        playerTwoPronouns: 'Jugador 2 · Pronombres',
        playerTwoSeed: 'Jugador 2 · Seed',
        playerTwoScore: 'Jugador 2 · Puntaje',
        matchLabel: 'Ronda',
        logo: 'Logo del torneo',
        infoLeft: 'Riel inferior izquierdo',
        infoCenter: 'Riel inferior central',
        infoRight: 'Riel inferior derecho'
      },
      align: { left: 'Izquierda', center: 'Centro', right: 'Derecha' },
      visibility: {
        flags: 'Mostrar banderas',
        sponsors: 'Mostrar patrocinadores y prefijos',
        xHandles: 'Mostrar usuarios de x.com',
        pronouns: 'Mostrar pronombres',
        seeds: 'Mostrar seeds',
        round: 'Mostrar ronda',
        tournamentLogo: 'Mostrar logo del torneo',
        bottomRails: 'Mostrar datos en los rieles inferiores'
      },
      outlineLabel: 'Contorno del texto',
      outline: { none: 'Ninguno', soft: 'Suave', strong: 'Fuerte' },
      typography: {
        nameSize: 'Nombre del jugador',
        metaSize: 'Datos del jugador',
        scoreSize: 'Puntaje',
        contextSize: 'Ronda y rieles'
      }
    },

    // Top 8 Matchups
    topEightMatchups: {
      title: 'Enfrentamientos del Top 8',
      description:
        'Presenta los dos enfrentamientos iniciales de ganadores y los dos de perdedores con un retrato por jugador.',
      eventName: 'Nombre del evento',
      detect: 'Buscar enfrentamientos en el evento cargado',
      loading: 'Cargando la configuración de enfrentamientos…',
      retry: 'Intentar de nuevo',
      winners: 'Ganadores',
      losers: 'Perdedores',
      player: 'Jugador {{number}}',
      portrait: 'Retrato del personaje',
      firstPage: 'Cargando la primera página del bracket…',
      explicitPhase: 'Cargando la fase «{{phase}}»…',
      topologyFallback: 'No se encontró una fase Top 8. Se revisará el bracket del evento…',
      pages: 'Cargando las páginas {{start}}–{{end}} de {{total}}…',
      analyzePhase: 'Buscando los cuatro enfrentamientos iniciales en «{{phase}}»…',
      analyzeEvent: 'Revisando {{count}} sets del evento…',
      notDetected:
        'JABS no pudo identificar un único bracket de Top 8. Revisa la estructura del evento o ingresa los jugadores manualmente.',
      tooLarge: 'El evento es demasiado grande para revisarlo de una vez. Primero selecciona la fase o el grupo final.',
      detected: 'Se cargaron los cuatro enfrentamientos iniciales del Top 8.',
      unavailable: 'La configuración de enfrentamientos del Top 8 no está disponible.',
      serializeFailed: 'JABS no pudo preparar la configuración de enfrentamientos del Top 8.',
      invalidStyling: 'Elige un estilo compatible.',
      invalidCatalog: 'Elige un catálogo válido de retratos de personajes.',
      invalidTournamentName: 'Ingresa un nombre de torneo de 1 a 120 caracteres.',
      invalidMatchupCount: 'Los enfrentamientos del Top 8 requieren exactamente cuatro partidas.',
      invalidBracketOrder:
        'Los enfrentamientos del Top 8 requieren dos partidas de ganadores seguidas de dos de perdedores.',
      invalidPlayerName: 'Ingresa un nombre de 1 a 100 caracteres para cada jugador.',
      blockedCharacter:
        'Ese nombre de personaje contiene texto bloqueado. Elige otro personaje.',
      blockedTournamentName: 'El nombre del torneo contiene texto bloqueado.',
      blockedEventName: 'El nombre del evento contiene texto bloqueado.',
      blockedPlayerName: 'El nombre de un jugador contiene texto bloqueado.',
      blockedSponsor: 'El nombre de un patrocinador contiene texto bloqueado.',
      preview: 'Vista previa de enfrentamientos del Top 8',
      flipPlayerTwo: 'Voltear todos los retratos del Jugador 2'
    },

    // Shared game selection and character folders
    generators: {
      previewFailed: 'No se pudo actualizar la vista previa.',
      game: 'Juego',
      characterFileGuides: 'Reemplaza los archivos vacíos con tus imágenes y conserva los nombres de los personajes.',
      preparingCharacters: 'Preparando las carpetas de personajes…',
      noCharacterRoster:
        'No hay una lista de personajes disponible para este juego. Puedes agregar tus propias imágenes.',
      selectGame: 'Selecciona un juego',
      selectEvent: 'Selecciona un evento primero',
      loadingGames: 'Cargando juegos…',
      noGames: 'No se encontraron juegos',
      gamesFailed: 'No se pudo cargar la lista de juegos de start.gg. Vuelve a abrirla para intentarlo de nuevo.',
      cachedGames: 'Usando la lista de juegos guardada.',
      unnamedGame: 'Juego {{id}}'
    },

    // Graphic backgrounds
    graphicBackground: {
      title: 'Fondo personalizado',
      choose: 'Elegir imagen',
      remove: 'Quitar fondo',
      none: 'Sin fondo personalizado',
      hint: 'PNG, JPEG o WebP. Hasta 15 MB, 8192×8192 y 40 megapíxeles.',
      failed: 'JABS no pudo usar esta imagen de fondo.'
    },

    // Artwork positioning
    mediaControls: {
      combinedEditingHelp: 'Alt+clic selecciona la imagen de atrás.',
      pointer: 'Arrastra una imagen o usa:',
      move: 'mover',
      moveFarther: 'mover más',
      resize: 'cambiar tamaño',
      flip: 'voltear'
    },

    // Top 8 graphic generator
    topEight: {
      description: 'Crea un gráfico de Top 8 con los resultados de un evento o completa las posiciones manualmente.',
      ready: 'Vista previa lista',
      draft: 'Faltan detalles',
      game: 'Catálogo de arte del juego',
      style: 'Estilo de composición',
      styles: { mosaic: 'Mosaico', neon: 'Neón' },
      mediaMode: 'Arte del Top 8',
      mediaModes: {
        character: 'Arte de personajes',
        photo: 'Fotos de jugadores',
        combined: 'Personaje + foto'
      },
      adjustLayer: 'Ajustar arte del participante',
      resetPlacement: 'Restablecer posición',
      tournament: 'Nombre del torneo (opcional)',
      headline: 'Titular (opcional)',
      headlineColor: 'Color del titular',
      tournamentLogo: 'Logo del torneo',
      noLogo: 'Sin logo del torneo',
      nowDownloading: 'Descargando ahora…',
      eventUrl: 'URL de evento completado de start.gg',
      loadEventUrl: 'Cargar Top 8 del evento',
      loadFromStartgg: 'Cargar desde start.gg',
      manualEventDetails: 'Detalles manuales del evento',
      manualEventUrl: 'Enlace del evento',
      manualEventUrlHint: 'Se muestra al pie del PNG exportado cuando se completa.',
      participantCount: 'Número de participantes',
      standingsLoaded: 'Se cargaron los resultados finales de {{event}}. Puedes editar los datos de cada jugador.',
      standingsNotFinal: 'start.gg todavía no reporta top 8 finalizado para este evento. El Top 8 manual no cambió.',
      standingsNotConventional:
        'Este evento no usa el orden convencional de 1.º, 2.º, 3.º, 4.º, dos 5.º y dos 7.º. El Top 8 manual no cambió.',
      standingsFailed: 'JABS no pudo cargar las posiciones finalizadas de este evento.',
      downloadPng: 'Descargar PNG 1920×1080',
      downloadFailed: 'JABS no pudo generar el PNG del Top 8.',
      assetsMatched: 'Imágenes de personajes encontradas: {{count}}',
      assetFolder: 'Arte de personajes:',
      portraitFolder: 'Retratos de personajes:',
      preview: 'Vista previa en vivo',
      previewQuality: 'El PNG usa tus ilustraciones originales a 1920×1080.',
      placements: 'Posiciones del Top 8',
      placement: 'Posición {{count}}',
      playerTag: 'Tag del jugador',
      character: 'Personaje',
      characters: 'Personajes',
      sponsor: 'Patrocinador / prefijo',
      xHandle: 'Usuario de x.com',
      country: 'País',
      displayFlag: 'Bandera mostrada',
      validation: {
        entrantCount: 'Ingresa exactamente ocho jugadores para el Top 8.',
        placements:
          'Las posiciones deben usar el orden convencional de doble eliminación: 1.º, 2.º, 3.º, 4.º, dos 5.º y dos 7.º.',
        playerTag: 'Ingresa un nombre para cada jugador.'
      }
    },

    // YouTube thumbnail generator
    thumbnail: {
      description: 'Crea una miniatura de YouTube con la partida en transmisión o ingresa los jugadores manualmente.',
      ready: 'Lista para exportar',
      needsDetails: 'Faltan detalles',
      game: 'Catálogo de arte del juego',
      style: 'Estilo de composición',
      styles: {
        versus: 'Versus',
        spotlight: 'Protagonista'
      },
      mediaMode: 'Arte de jugadores',
      mediaModes: {
        character: 'Arte de personajes',
        photo: 'Fotos de jugadores',
        combined: 'Personaje + foto'
      },
      assetFolder: 'Arte de personajes:',
      portraitFolder: 'Retratos de personajes:',
      tournament: 'Nombre del torneo (opcional)',
      headline: 'Fase · Ronda (opcional)',
      headlineColor: 'Color de fase y ronda',
      logo: 'Logo del torneo',
      noLogo: 'Sin logo del torneo',
      useStreamMatch: 'Usar partida en transmisión',
      autoStreamMatch:
        'Al enviar una partida de torneo a transmisión, se completan sus jugadores y datos. Usa el botón para copiar una exhibición o actualizar la partida actual.',
      preview: 'Vista previa en vivo',
      downloadPng: 'Descargar PNG 1280×720',
      downloadFailed: 'JABS no pudo generar el PNG de la miniatura.',
      player: 'Jugador {{count}}',
      adjustLayer: 'Ajustar capa visual',
      adjustCharacter: '{{player}} · Personaje',
      adjustPhoto: '{{player}} · Foto del jugador',
      mediaScale: 'Tamaño del recurso',
      resetPlacement: 'Restablecer posición',
      showTournamentLogo: 'Mostrar logo del torneo',
      showSponsorLogo: 'Mostrar logo del patrocinador'
    },

    // Moderation controls
    moderation: {
      title: 'Excepciones de moderación',
      description:
        'Permite nombres o valores completos que se bloquearon por error.',
      path: 'Archivo:',
      open: 'Editar lista permitida',
      openHint: 'Edita las excepciones de moderación en JABS.',
      reload: 'Recargar lista',
      reloadHint: 'Vuelve a leer los cambios hechos fuera de JABS.',
      editorTitle: 'Editar lista de moderación',
      editorLabel: 'Excepciones de moderación',
      editorDescription:
        'Agrega un nombre o valor completo por línea. Los términos protegidos no se pueden permitir. Las líneas que comienzan con # son comentarios.',
      cancel: 'Cancelar',
      save: 'Guardar',
      saved_one: 'Lista de moderación guardada con {{count}} excepción.',
      saved_other: 'Lista de moderación guardada con {{count}} excepciones.',
      reloaded_one: 'Lista de moderación recargada con {{count}} excepción.',
      reloaded_other: 'Lista de moderación recargada con {{count}} excepciones.',
      openFailed: 'JABS no pudo abrir la lista de moderación.',
      saveFailed: 'JABS no pudo guardar la lista de moderación.',
      reloadFailed: 'JABS no pudo recargar la lista de moderación.',
      fileTooLarge: 'La lista de moderación debe tener 256 KiB o menos.',
      tooManyEntries: 'La lista de moderación admite como máximo 4,096 entradas.',
      lineTooLong: 'La línea {{line}} de la lista de moderación supera los 256 caracteres.',
      protectedEntry: 'La línea {{line}} contiene un término protegido y no se puede permitir.'
    },

    // Notification labels
    notices: {
      connection: 'Conexión',
      dismiss: 'Descartar notificación',
      actionFailed: 'La acción falló',
      checkThis: 'Revisa esto',
      done: 'Listo',
      notice: 'Aviso'
    },

    // Action confirmations and results
    messages: {
      exportCompleted: 'Exportación completada: {{filename}}',
      openLinkFailed: 'No se pudo abrir este enlace en tu navegador.',
      // Bracket search
      loadSearch: 'No se pudieron cargar todas las páginas del bracket para buscar.',

      // Token storage
      enterToken: 'Ingresa primero un token de start.gg.',
      sessionTokenSaved:
        'JABS conservará el token hasta que cierres la aplicación. Carga un torneo para verificarlo con start.gg.',
      tokenSaved:
        'El token se guardó en el almacén de credenciales de tu sistema. Carga un torneo para verificarlo con start.gg.',
      saveTokenFailed: 'No se pudo guardar el token.',
      tokenRemoved: 'El token de start.gg se eliminó de este dispositivo.',
      removeTokenFailed: 'No se pudo eliminar el token.',

      // Tournament loading and cache
      tournamentUnloaded: 'Se cerró el torneo y se borró la partida de la transmisión.',
      exhibitionGameFailed: 'No se pudo cambiar el juego de la exhibición. Vuelve a seleccionarlo.',
      tournamentUnloadFailed: 'No se pudieron cerrar el torneo y borrar el estado activo de la transmisión.',
      clearCacheConfirm:
        '¿Borrar el historial de torneos recientes y reiniciar el selector de sets? El estado activo y los cambios guardados permanecerán intactos.',
      cacheCleared:
        'Se limpiaron el selector de sets y el historial de torneos recientes. Se conservaron el estado activo y los cambios guardados.',
      clearCacheFailed: 'No se pudo borrar el historial del bracket.',
      tournamentRequired: 'Ingresa primero el slug de un torneo o una URL de start.gg.',
      recentHistoryNotSaved: 'El torneo se cargó, pero JABS no pudo guardarlo en Torneos recientes.',
      noEvents: 'No se encontraron eventos. Revisa el slug o la URL y confirma que el torneo sea visible en start.gg.',
      loadEventsFailed: 'No se pudieron cargar los eventos.',

      // Bracket browsing
      loadedPhases: 'Se cargaron {{count}} fases.',
      phasesFailed: 'Fases: {{message}}',
      loadPhasesFailed: 'No se pudieron cargar las fases.',
      showingEventSets: 'Mostrando {{shown}} de {{total}} sets del evento.',
      showingPhaseSets: 'Mostrando {{shown}} de {{total}} sets de la fase.',
      setsFailed: 'Sets: {{message}}',
      loadSetsFailed: 'No se pudieron cargar los sets.',
      selectEvent: 'Selecciona primero un evento.',
      loadedPools: 'Se cargaron {{shown}} de {{total}} pools.',
      poolsFailed: 'Pools: {{message}}',
      loadPoolsFailed: 'No se pudieron cargar los grupos de fase.',
      selectPhase: 'Selecciona primero una fase.',
      positiveStation: 'Ingresa un número de estación positivo.',
      showingScopeSets: 'Mostrando {{shown}} de {{total}} sets de {{scope}}.',

      // Quick score reporting
      quickLoadFailed: 'No se pudo cargar este set para la actualización rápida.',
      quickSetRequired: 'Carga primero un set para la actualización rápida.',
      quickConfirm:
        '¿Reportar rápidamente a {{winner}} como ganador en start.gg?\n\n{{playerOne}} {{scoreOne}}–{{scoreTwo}} {{playerTwo}}\nID del set: {{setId}}\n\nEsto actualiza el bracket en vivo sin cambiar la partida en transmisión.',
      quickReceipt: '{{winner}} ganó {{winnerScore}}–{{loserScore}}. start.gg aceptó el set {{setId}}{{completion}}.',
      markedComplete: ' y lo marcó como completado',
      quickReportFailed: 'No se pudo reportar rápidamente este set a start.gg.',

      // Stream edits and result reporting
      selectSetFailed: 'No se pudo seleccionar el set.',
      streamSaved: 'Se guardaron los cambios de la transmisión y se enviaron a OBS.',
      saveStreamFailed: 'No se pudo guardar el estado de transmisión.',
      reportSetRequired: 'Carga un set de start.gg antes de reportar un resultado.',
      reportConfirm:
        '¿Reportar a {{winner}} como ganador en start.gg?\n\n{{playerOne}} {{scoreOne}}–{{scoreTwo}} {{playerTwo}}\n{{history}}ID del set: {{setId}}\n\nEsto modifica el bracket en vivo y puede avanzar participantes.',
      reportHistoryExact: 'El historial registrado de {{count}} juegos también reportará el marcador del set.\n',
      reportHistoryWinnerOnly:
        'Solo se puede reportar al ganador porque este set se cargó con un marcador, pero sin un registro de las partidas jugadas.\n',
      reportExactSuccess: '{{winner}} y el marcador {{winnerScore}}–{{loserScore}} se reportaron en start.gg.',
      characterSelectionsReported: 'Selecciones de personaje incluidas: {{count}}.',
      reportWinnerSuccess:
        '{{winner}} se reportó como ganador en start.gg. El marcador no se envió porque se desconocía el orden de las partidas.',
      selectorRefreshFailed:
        'No se pudo actualizar la lista de sets. Elige Actualizar selector de sets para intentarlo de nuevo.',
      reportFailed: 'No se pudo reportar el set a start.gg.',

      // Refresh the streamed set
      reloadConfirm:
        '¿Actualizar jugadores, marcadores, ronda, estación e historial de Versus desde start.gg? Se conservarán el perfil de juego, el estilo y los extras de transmisión.',
      reloadSuccess: 'Se actualizaron el set actual y el historial de Versus desde start.gg.',
      reloadSetSuccess: 'Se actualizó el set actual.',
      reloadSetOnly:
        'Se actualizó el set actual. El historial entre jugadores requiere perfiles de start.gg vinculados.',
      reloadHistoryFailed: 'Se actualizó el set actual, pero no su historial de Versus.',
      reloadFailed: 'No se pudo actualizar este set desde start.gg.',

      // Live controls
      scoreFailed: 'No se pudo actualizar el marcador.',
      scoresReset: 'Se reiniciaron los marcadores.',
      playersSwapped: 'Se intercambiaron los lados de los jugadores.',
      commentatorsSwapped: 'Se intercambiaron los lados de los comentaristas.',
      stateFailed: 'No se pudo actualizar el estado de transmisión.',

      // OBS URLs
      obsCopied: 'Se copió la URL del overlay de OBS.',
      copyFailed: 'No se pudo copiar la URL local.'
    }
  },
  // Application and start.gg errors
  errors: {
    nativeFailure: 'No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.',
    invalidLocalResponse: 'El servicio local devolvió datos no válidos para {{source}}.',
    realtimeConnection: 'Se interrumpió la conexión en vivo. Reconectando…',

    generic: 'Algo salió mal.',
    localSettings: 'No se pudo cargar la configuración local de la aplicación.',
    updateScore: 'No se pudo actualizar el marcador.',
    updateState: 'No se pudo actualizar el estado de transmisión.',
    copyUrl: 'No se pudo copiar la URL local.',
    invalidPort: 'JABS recibió un puerto no válido para la API local.',
    desktopTokenOnly: 'La administración del token solo está disponible dentro de la aplicación de escritorio JABS.',
    localService:
      'El servicio local de JABS dejó de responder en {{url}}. Reinicia la aplicación de escritorio e inténtalo de nuevo. Encontrarás el registro de diagnóstico, jabs-main.log, en la carpeta de datos de la aplicación.',
    localServiceAfterRetry:
      'El servicio local de JABS dejó de responder en {{url}} después de un reintento. Reinicia la aplicación de escritorio e inténtalo de nuevo. Encontrarás el registro de diagnóstico, jabs-main.log, en la carpeta de datos de la aplicación.',
    http: 'La solicitud falló con HTTP {{status}}',
    // start.gg error messages
    startgg: {
      playerReference: 'Escribe una URL de perfil de start.gg, un código de perfil o un ID numérico de jugador.',
      playerNotFound: 'No se encontró un perfil de jugador. Revisa el enlace o el ID.',
      publicUnavailable:
        'No se pudieron cargar estos datos mediante el acceso público de start.gg. Intenta de nuevo o agrega un token en Acceso a la API. Los controles locales de tus overlays siguen funcionando.',
      tokenMissing:
        'Agrega un token de start.gg para reportar resultados. Los controles locales de tus overlays no lo necesitan.',
      authentication: 'start.gg rechazó el token. Comprueba que siga vigente y vuelve a guardarlo.',
      permission: 'Este token de start.gg no tiene permiso para la acción solicitada en el torneo.',
      rateLimit:
        'Se alcanzó el límite de solicitudes de start.gg. Espera aproximadamente un minuto e inténtalo de nuevo.',
      queryComplexity:
        'start.gg rechazó esta solicitud por ser demasiado compleja. Reduce la vista del bracket e inténtalo de nuevo.',
      timeout: 'start.gg tardó demasiado en responder. Inténtalo de nuevo.',
      network: 'JABS no pudo comunicarse con start.gg. Revisa la conexión a internet e inténtalo de nuevo.',
      upstream:
        'La API de start.gg devolvió un error temporal del servidor. El sitio web puede seguir en línea; intenta cargar de nuevo en breve.',
      invalidResponse: 'JABS no pudo leer los datos recibidos de start.gg.',
      graphql: 'start.gg rechazó la solicitud del bracket. Revisa los datos del torneo seleccionado y los permisos.',
      conflict: 'Este set cambió después de abrirlo. Vuelve a abrirlo y revisa el resultado más reciente.'
    }
  }
} satisfies LocaleCatalog;
