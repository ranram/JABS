export const en = {
  // Common labels and actions
  common: {
    language: 'Language',
    // Language choices
    languages: {
      en: 'English',
      es419: 'Español (Latinoamérica)'
    },
    // Common actions
    actions: {
      copy: 'Copy',
      close: 'Close',
      cancel: 'Cancel',
      done: 'Done',
      previous: 'Previous',
      next: 'Next',
      resetScores: 'Reset scores',
      swapPlayers: 'Swap players',
      select: '---- Select ----'
    },
    // Status labels
    status: {
      live: 'Live',
      sending: 'Sending',
      loading: 'Loading…',
      reconnecting: 'Reconnecting',
      ready: 'Ready',
      working: 'Working',
      pending: 'Pending',
      completed: 'Completed',
      onStream: 'On Stream'
    },
    // Match details
    match: {
      bestOf: 'Best of {{count}}',
      firstTo: 'First to {{count}}',
      topanga: 'Topanga Rules',
      topangaDescription:
        'First to 7 wins, with a two-win lead required. The first player to reach 10 wins takes the match regardless of the lead.',
      seed: 'Seed {{seed}}',
      set: 'Set {{id}}',
      stream: 'Stream',
      versus: 'vs',
      finalScore: 'Final Score: {{one}} - {{two}}'
    },
    // Media folders
    mediaFolder: {
      open: 'Open folder',
      openHint: 'Open this media folder in your file manager.',
      openFailed: 'JABS could not open the media folder.'
    },
    pagination: 'Page {{page}} of {{totalPages}}'
  },
  // OBS overlays
  overlay: {
    invalidTitle: 'Invalid overlay URL',
    invalidBody:
      'Use /overlay/active/main, /overlay/active/winner, /overlay/active/versus, /overlay/active/stats?player=1, /overlay/active/top-eight-matchups, /overlay/commentators, /overlay/active/bracket, or a supported fixed game route.',
    waiting: 'Waiting for a match…',
    broadcastInformation: 'Broadcast information',
    winnerAnnouncement: 'Winner',
    championAnnouncement: 'Champion',
    stats: {
      title: 'Player Stats',
      recentPlacements: 'Recent Placements',
      currentRun: 'Current Run',
      loading: 'Loading tournament results…',
      unavailable: 'Results are temporarily unavailable. Retrying…',
      placementsUnavailable: 'Recent placements could not be loaded. Retrying…',
      runUnavailable: 'The tournament run could not be loaded. Retrying…',
      incompleteRun: 'Some matches could not be loaded. Retrying…',
      noMatches: 'No completed matches yet',
      linkProfile: 'Link a start.gg player profile to show recent placements.',
      chooseTournament: 'Send a tournament match to Stream to show its run.',
      invalidPlayer: 'Use ?player=1 or ?player=2 in the Player Stats URL.',
      runPage: 'Matches {{first}}–{{last}} of {{total}}'
    },
    // Top 8 Matchups
    topEightMatchups: {
      title: 'Top 8 Matchups',
      winners: 'Winners',
      losers: 'Losers',
      loading: 'Loading Top 8 Matchups…'
    },
    versus: {
      upcomingMatch: 'Upcoming match',
      location: 'Location {{country}}',
      locationUnknown: 'Location unknown',
      representing: 'Representing {{sponsor}}',
      stats: { age: 'Age', sponsor: 'Sponsor', seed: 'Seed', nickname: 'Nickname' },
      headToHead: 'Head-to-head',
      noHeadToHead: 'No head-to-head results found',
      noPlacements: 'No recent placements found',
      win: 'W',
      loss: 'L'
    },
    playerScore: '{{player}} score {{score}}'
  },
  // Operator interface
  operator: {
    support: {
      title: 'Diagnostics & support',
      description: 'Tell us what happened and when. Export a report and attach it to your email.',
      export: 'Export report',
      openFolder: 'Open logs folder',
      desktopOnly: 'Logs are available in the JABS desktop app.',
      privacy: 'Reports omit tokens, player details, and saved settings. Nothing is sent automatically.',
      copyEmail: 'Copy email',
      copied: 'Support email copied.',
      failed: 'JABS could not complete this action. Try again.'
    },
    help: {
      title: 'Help',
      tutorials: 'Tutorials',
      supportDevelopment: 'Support JABS on Ko-fi',
      next: 'Next',
      previous: 'Back',
      done: 'Done',
      close: 'Close guide',
      progress: '{{current}} of {{total}}',
      missing: 'Complete the earlier steps to make this section available. You can go back or continue.',
      failed: 'Could not open this guide. Try again from Help.',
      tokenLink: 'Open start.gg token instructions',
      guides: {
        tournament: 'Run a tournament',
        exhibition: 'Run an exhibition',
        topEight: 'Create a Top 8 graphic',
        thumbnail: 'Create a YouTube thumbnail',
        tokens: 'Connect a start.gg token',
        library: 'Use the Player Library',
        media: 'Move and resize images',
        scoreboard: 'Create a custom scoreboard',
        stingers: 'Set up stingers'
      },
      steps: {
        tournament: {
          title: 'Load your tournament',
          body: 'Paste the start.gg tournament link, then choose Load events. Public tournaments work without a token.'
        },
        event: {
          title: 'Choose an event',
          body: 'Select the event you are running. Phase, pool, and station filters help narrow the match list.'
        },
        sets: {
          title: 'Send a match to stream',
          body: 'Search for the players or round and open a match. Choose Send to Stream to load it into the overlays.'
        },
        stream: {
          title: 'Prepare the match',
          body: 'Check the names, characters, flags, and match format. JABS checks and saves your edits before updating OBS.'
        },
        obs: {
          title: 'Connect OBS',
          body: 'Copy a URL from this menu into an OBS Browser Source at 1920×1080. Keep JABS running while broadcasting. For overlays that should replay their entrance when you return to a scene, enable “Shutdown source when not visible” and “Refresh browser when scene becomes active”. Leave both off for Stingers.'
        },
        exhibition: {
          title: 'Start without a tournament',
          body: 'If a tournament is loaded, use Bracket → Options → Unload tournament first. This clears the live match so you can prepare an exhibition.'
        },
        game: {
          title: 'Choose the game',
          body: 'Choose the game in Edit stream state to set the match rules and available artwork. You can choose a different scoreboard style.'
        },
        players: {
          title: 'Choose the players',
          body: 'Enter tags or choose players from the suggestions, then pick their characters and outfits. Choosing saved players fills in their details and lets you check their head-to-head history.'
        },
        scores: {
          title: 'Keep score locally',
          body: 'Use the score controls as games finish. Exhibition formats include first-to matches and Topanga Rules. Local score changes are separate from reporting to start.gg.'
        },
        topEight: {
          title: 'Prepare a Top 8 graphic',
          body: 'Choose a game, tournament name, and headline. Load final start.gg standings or fill in the placements yourself.'
        },
        assets: {
          title: 'Add your artwork',
          body: 'Open a folder from Media. Name your files after the player, sponsor, or character, then choose Reload assets.'
        },
        placements: {
          title: 'Fill in the placements',
          body: 'Check the eight players, sponsors, characters, outfits, and flags. You can pick saved players from the name suggestions.'
        },
        topEightExport: {
          title: 'Adjust and export',
          body: 'Drag artwork in the preview to frame each player, then download the 1920×1080 PNG. The export uses your original artwork.'
        },
        thumbnail: {
          title: 'Prepare a thumbnail',
          body: 'Choose a game, tournament name, and headline. Use the match on stream or enter your own players.'
        },
        thumbnailPlayers: {
          title: 'Set up both players',
          body: 'Choose each player’s name, sponsor, character, outfit, and flag. Pick a saved player to fill in the details you’ve already set up.'
        },
        thumbnailExport: {
          title: 'Frame your thumbnail',
          body: 'Position the artwork in the live preview, then download the 1280×720 PNG. Character art and player photos can be moved independently.'
        },
        tokenPurpose: {
          title: 'When you need a token',
          body: 'Public tournament browsing and local OBS controls work without a token. Add a token to report results or use authenticated browsing.'
        },
        tokenCreate: {
          title: 'Create a start.gg token',
          body: 'Follow the official instructions below to create a token in start.gg Developer Settings. Copy it when it is shown, then paste it into API access.'
        },
        tokenStorage: {
          title: 'Save or use for this session',
          body: 'Save token uses your operating system’s secure credential storage. If that storage is unavailable, Use for session keeps it in memory until JABS closes.'
        },
        reporting: {
          title: 'Reporting needs permission',
          body: 'Your start.gg account must have reporting permission for the tournament. JABS asks for confirmation and checks the current set before sending a result.'
        },
        library: {
          title: 'Open Players',
          body: 'Save player details and their usual characters here so you can reuse them for future matches. Choose Next to open Players.'
        },
        libraryFind: {
          title: 'Add a player',
          body: 'Look up a start.gg profile, add a local player, or use a player already on stream. Import event players beside the event selector to add a tournament’s players.'
        },
        librarySelect: {
          title: 'Find a saved player',
          body: 'Search the list and select a player to edit. Their start.gg profiles help tell apart players who use the same tag.'
        },
        libraryDefaults: {
          title: 'Remember a player’s setup',
          body: 'Set characters, outfits, and photo framing for each game, then choose Save player. In Edit stream state, changes to saved players’ flags, pronouns, social handles, and characters save automatically.'
        },
        libraryBackup: {
          title: 'Back up your library',
          body: 'Export library saves your players and their settings as a JSON file. Pictures stay in their folders. Import library adds players without replacing records you already have.'
        },
        media: {
          title: 'Work in the live preview',
          body: 'Once artwork is loaded, click an image to select it. Character + photo mode starts with the character behind the player photo.'
        },
        mediaSelect: {
          title: 'Select either image',
          body: 'Click visible artwork to select it. Transparent areas let you reach the other image; Alt+click selects an overlapping image behind.'
        },
        mediaMove: {
          title: 'Move, resize, and flip',
          body: 'Drag to move the selected image. Arrow keys move it, Shift + arrows moves farther, + / − resizes, and F flips it.'
        },
        mediaReset: {
          title: 'Reset one image',
          body: 'Choose Reset position to restore the selected image’s position, size, and flip. The other image keeps its placement.'
        },
        scoreboard: {
          title: 'Import a scoreboard frame',
          body: 'Choose a transparent PNG near 1920×1080, enter a name, and import it. The frame can be up to 20 MB.'
        },
        scoreboardLayout: {
          title: 'Place the live fields',
          body: 'Choose a saved layout, then click or select a field to position it. Alt+click reaches overlapping fields. Arrow keys move a field; Shift moves it 10 pixels.'
        },
        scoreboardRails: {
          title: 'Add broadcast extras',
          body: 'Enable the left, center, and right rails in the editor. Left and right rails use your broadcast text; the center rail shows match context.'
        },
        scoreboardSave: {
          title: 'Layouts save automatically',
          body: 'Edits save automatically; the status beside the title shows whether they are saved. Choose Use in OBS to put this layout on air.'
        },
        stingers: {
          title: 'Choose your clips',
          body: 'Add Perfect and Winner videos in WebM format. Winner can play automatically when the score completes the set.'
        },
        stingerFraming: {
          title: 'Frame the winner',
          body: 'Use the framing preview to check the player photo, character art, and name banner. Set when the winner assets appear in your clip; this preview does not trigger OBS.'
        },
        stingerObs: {
          title: 'Add the source to OBS',
          body: 'Copy the Stingers URL into a 1920×1080 Browser Source above your other sources. Reuse it across scenes and check that it shows as active in JABS. Leave “Shutdown source when not visible” and “Refresh browser when scene becomes active” unchecked so switching scenes won’t interrupt playback.'
        },
        stingerPlay: {
          title: 'Play clips from any tab',
          body: 'Use this menu to play configured clips or stop playback. Winner needs a completed set score. Reconnect OBS source refreshes the connection when needed.'
        }
      }
    },
    quickTools: {
      assets: 'Open assets folder',
      folders: 'Media folders',
      playerPhotos: 'Player photos',
      headshots: 'Player headshots',
      sponsors: 'Sponsors',
      logos: 'Tournament logos',
      characters: 'Character art',
      portraits: 'Character portraits',
      folderFailed: 'Could not open this folder.',
      tools: 'Tools',
      bracketOptions: 'Options',
      presentation: 'Appearance',
      moreDetails: 'More details',
      playerDetails: 'Player details',
      preview: 'Preview',
      download: 'Download PNG',
      loadingPreview: 'Updating preview…',
      enterPlayers: 'Enter both player names.',
      broadcastExtras: 'Broadcast extras',
      leftRail: 'Left rail',
      centerRail: 'Center rail',
      rightRail: 'Right rail',
      importNew: 'Import a new scoreboard',
      railsHelp: 'The side rails show your broadcast text. The center rail shows match details.',
      clipSettings: 'Winner settings'
    },
    scoreboardPhotos: {
      side: 'Photo side',
      unsupported: 'No scoreboard photo layout is available for this game.',
      recommendedSize: 'Recommended: 512 × 512 px, head and shoulders.',
      enabled: 'Player photos in scoreboards',
      logoBackdrop: 'Tournament logo behind players',
      sponsorBackdrop: 'Sponsor logos behind players',
      chooseLogo: 'Choose a tournament logo in Broadcast extras.',
      help: 'Prepare photos in <players>Players</players>. Placement follows the selected game. Works with custom scoreboards as well.',
      preparation: 'Scoreboard photo',
      headshotsFolder: 'Player headshots',
      reload: 'Reload images',
      imageFailed: 'Unable to load this image. Check the file and reload.',
      changed: 'This image changed. Check its framing before confirming.',
      confirmImage: 'Use current image',
      reset: 'Reset framing',
      saveFailed: 'Unable to save scoreboard photo settings. Reload and try again.',
      loadFailed: 'Unable to load scoreboard photo settings.',
      noImage: 'No matching player image.'
    },
    appSubtitle: 'Just Another Bracketing System',
    // Player library
    players: {
      // Library navigation
      title: 'Players',
      add: 'Add player',
      closePlayer: 'Close player',
      search: 'Search tags and aliases',
      searchPlaceholder: 'Type a player tag…',
      count: '{{count}} saved players',
      localPlayer: 'Local player',
      gameCount: 'Games: {{count}}',
      noMatches: 'No players match this search.',
      emptyLibrary: 'Your saved players will appear here.',
      onStream: 'On stream',
      fromStream: 'Edit saved defaults: {{name}}',
      newPlayer: 'New player',
      choosePlayer: 'Choose a player',
      choosePlayerHelp: 'Choose a saved player to edit their details, or add a player.',

      // Player details and saved choices
      detailsHeading: 'Player details',
      identityHeading: 'Linked profile and IDs',
      localId: 'Local ID',
      startggId: 'start.gg player ID',
      profile: 'Open start.gg profile',
      useImported: 'Use imported value',
      aliases: 'Other tags',
      gamesHeading: 'Game preferences',
      game: 'Game preferences',
      chooseGameHelp: 'Choose a game to save this player’s characters and artwork.',
      characters: 'Characters, in team order',
      artwork: 'Character artwork',
      portrait: 'Character portrait',
      clearGame: 'Clear saved choices for this game',
      save: 'Save player',
      saved: 'Player saved. These defaults will apply the next time you load them.',
      defaultsSaved: 'Defaults saved for {{name}}.',
      defaultsModerated: 'Defaults saved for {{name}}. Some text was blocked.',
      defaultsSaveFailed: 'Could not save defaults for {{name}}.',
      defaultsUnlinked: 'This player is not in the library.',
      defaultsIdentityChanged: 'The linked start.gg player changed. Reload the player and try again.',
      savedWithModeration: 'Blocked changes to {{fields}} were not saved.',
      blockedTag: 'The player tag contains blocked language; enter another tag to save.',
      reload: 'Reload player',
      delete: 'Delete player',
      deleted: 'Player removed from your library.',
      confirmDelete: 'Confirm deletion',
      cancelDelete: 'Cancel deletion',
      unsaved: 'Unsaved changes',
      unsavedTitle: 'Unsaved player changes',
      unsavedHelp: 'Save your changes or discard them before leaving this player.',
      saveContinue: 'Save and continue',
      discardContinue: 'Discard changes',
      keepEditing: 'Keep editing',
      actionFailed: 'Could not complete this player library action.',
      searchFailed: 'Could not search your player library.',
      loadFailed: 'Could not load the saved player. You can still enter a name.',
      assetsFailed: 'Could not load character artwork. Saved choices are still available.',
      photoHelp:
        'Recommended: 1024 × 1536 px (2:3), head to waist. Enter a filename with its extension to use a specific photo.',
      nicknameHelp: 'On-air nickname, separate from search aliases.',
      overrideHelp: 'Your edits are kept when start.gg details refresh. Clear a field to hide its imported value.',
      fields: {
        name: 'Player tag',
        prefix: 'Sponsor / prefix',
        xHandle: 'X handle',
        pronouns: 'Pronouns',
        country: 'Country code',
        state: 'State / region',
        age: 'Age',
        nickname: 'Nickname',
        displayFlag: 'Flag override',
        playerPhotoAssetId: 'Player photo filename'
      },

      // Event imports and library files
      lookupLabel: 'Add from start.gg',
      lookupPlaceholder: 'Profile URL or numeric player ID',
      lookupHelp: 'You can also paste the profile code after /user/.',
      lookup: 'Find player',
      lookupSaved: 'Opened {{name}} from your player library.',
      lookupImported: 'Added {{name}} from start.gg.',
      export: 'Export library',
      importFile: 'Import library',
      fileTooLarge: 'Choose a library file smaller than 50 MB.',
      fileImported: '{{added}} players added; {{skipped}} existing players kept unchanged.',
      importEvent: 'Import event players',
      stopImport: 'Stop import',
      importStopped: 'Import stopped. Players already saved remain in the library.',
      importProgress: 'Importing page {{page}} of {{total}}…',
      importDone: 'Import complete. {{count}} new players added; existing profiles refreshed.',
      importFailed: 'Import stopped. Players already imported are saved. You can try again.'
    },

    // Global broadcast appearance and portable presets
    appearance: {
      settings: 'Settings',
      loading: 'Loading settings…',
      bracketNames: 'Bracket names',
      bracketNamesHelp:
        'Use your own names for bracket headings. Empty fields use the normal labels; round names stay as provided by start.gg.',
      colorOverride: 'Override style colors',
      primaryColor: 'Primary color',
      secondaryColor: 'Secondary color',
      colorHelp: 'Turning this off restores the selected style’s colors. Uploaded artwork keeps its original colors.',
      textSize: 'Broadcast text size',
      defaultText: 'Default',
      largeText: 'Larger',
      broadcastLanguage: 'OBS language',
      followLanguage: 'Same as JABS',
      animations: 'Play entrance animations',
      presets: 'Appearance presets',
      savedPreset: 'Saved preset',
      choosePreset: 'Choose a preset',
      presetName: 'Preset name',
      savePreset: 'Save preset',
      updatePreset: 'Update preset',
      deletePreset: 'Delete preset',
      importPreset: 'Import preset',
      exportPreset: 'Export current appearance',
      presetHelp:
        'Presets save colors, bracket names, text size, language, and the animation setting. Importing a preset applies it immediately. You can save up to 20.',
      restoreDefaults: 'Restore defaults',
      restoreHelp: 'Restores the appearance defaults and keeps your saved presets.',
      defaultPresetName: 'My stream',
      importFailed: 'Could not import preset',
      importHelp: 'Choose a JABS appearance JSON file exported from Settings.',
      exportFailed: 'Could not export preset',
      tryAgain: 'Try again after the settings finish saving.',
      startingRound: '{{bracket}} starting round'
    },
    // Bracket OBS screen
    bracketScreen: {
      headingLabel: 'Header title',
      eventLabel: 'Event label',
      title: 'Bracket',
      winners: 'Winners',
      losers: 'Losers',
      loading: 'Loading bracket settings…',
      winnersRounds: 'Winners starting round',
      losersRounds: 'Losers starting round',
      autoRounds: 'Automatic',
      loadingPools: 'Loading pools…',
      refresh: 'Refresh bracket',
      refreshHelp: 'Active pools refresh once a minute. Completed pools update only when you refresh them.',
      chooseScope: 'Choose a phase and pool to show the bracket.',
      waiting: 'Loading the selected pool…',
      noMatches: 'This pool has no published matches yet.',
      failed: 'Could not update the bracket',
      winnerOf: 'Winner: {{round}}',
      loserOf: 'Loser: {{round}}',
      tbd: 'TBD',
      bye: 'Bye'
    },

    // Header and connection status
    topbar: {
      onStream: 'On stream',
      loadingState: 'Loading state…',
      apiVerified: 'API verified',
      sessionToken: 'Session token',
      tokenStored: 'Token stored',
      sessionMode: 'Session mode',
      needsToken: 'Needs token'
    },

    // App updates
    updates: {
      check: 'Check for updates',
      updateNow: 'Update now',
      restart: 'Restart now',
      title: 'Update JABS',
      current: 'JABS is up to date.',
      available: 'Version {{version}} is available.',
      confirm: 'Update JABS from {{current}} to {{next}}?',
      installRestart: 'Install and restart',
      restartNotice:
        'JABS will restart. OBS sources will briefly disconnect. Export any unfinished graphics before updating.',
      finishEditing: 'Finish editing and wait for saves or reports to complete before updating.',
      downloading: 'Downloading update…',
      installing: 'Installing update…',
      restarting: 'Restarting JABS…',
      installed: 'The update is installed. Restart JABS to finish.',
      development: 'Updates are available in installed release builds.',
      unavailable: 'Updates are not available in this build.',
      packageManager:
        'Update this Linux package through your package manager. In-app updates are available with the AppImage.',
      supportFailed: 'Unable to load update settings. Restart JABS and try again.',
      checkFailed: 'Unable to check for updates. Check your internet connection and try again.',
      installFailed: 'The update could not be installed. Try again.',
      restartFailed: 'The update is installed, but JABS could not restart. Try again or close and reopen JABS.'
    },

    // Workspace navigation and overlay settings
    stingers: {
      loadFailed: 'Unable to load stingers.',
      activateSource: 'Place the Stingers browser source in your active OBS scene.',
      loading: 'Loading stingers…',
      failed: 'Unable to update stingers.',
      retry: 'Retry',
      reconnect: 'Reconnect OBS source',
      perfect: 'Perfect',
      winner: 'Winner',
      video: 'Video',
      chooseVideo: 'Choose a WebM video',
      webmOnly: 'Choose a WebM video. Convert other formats before importing.',
      audioHelp: 'Manage sound with Control audio via OBS in the browser source properties.',
      formats: 'WebM · VP8/VP9 video, optional Opus/Vorbis audio · Up to 256 MB.',
      useDuration: 'Limit playback duration',
      duration: 'Duration (seconds)',
      playBroadcast: 'Play in OBS',
      playClip: 'Play {{name}}',
      playingClip: 'Playing: {{name}}',
      queuedClip: 'Starting: {{name}}',
      configure: 'Configure stingers',
      noClips: 'No videos configured yet.',
      unavailable: 'Waiting for the stinger connection.',
      preview: 'Preview here',
      remove: 'Remove video',
      stopBroadcast: 'Stop in OBS',
      stopPreview: 'Stop preview',
      readySources_one: '{{count}} active OBS source',
      readySources_other: '{{count}} active OBS sources',
      sourceHelp: 'Place this 1920×1080 browser source above your other sources. Reuse the same source across scenes.',
      automaticWinner: 'Play Winner automatically when the score completes the set',
      automaticHelp: 'Score corrections and reconnects do not replay the celebration.',
      currentWinner: 'Current winner: {{name}}',
      noWinner: 'Complete the set score to play Winner.',
      mediaDelay: 'Show winner assets after (seconds)',
      layer: 'Video position',
      behind: 'Behind winner assets',
      inFront: 'In front of winner assets (transparent video)',
      framing: 'Winner framing · 1920×1080',
      framingHelp: 'Prepare your animation around these fixed regions. This preview never triggers OBS.',
      previewPlayer: 'Preview player',
      playerOne: 'Player 1',
      playerTwo: 'Player 2',
      photo: 'Player photo',
      character: 'Character art',
      name: 'Player name',
      tooLarge: 'Choose a video no larger than 256 MB.',
      playbackFailed: 'This video could not play. Check its codec and try another export.'
    },
    workspaces: {
      stingers: 'Stingers',
      aria: 'JABS workspaces',
      bracket: 'Bracket Management',
      customScoreboard: 'Custom Scoreboard',
      otherOverlays: 'Overlays',
      topEight: 'Top 8 Generator',
      thumbnail: 'YouTube Thumbnail Generator',
      otherOverlaysTitle: 'OBS Overlays',
      obsSource: 'OBS Browser Source',
      resolvingObs: 'Loading the OBS URL…',
      winnerAutomatic: 'One OBS source automatically shows the set winner or tournament champion.',
      styling: 'Style',
      transparentBackground: 'Transparent background',
      playerStats: {
        loading: 'Loading Player Stats settings…',
        sharedSettings: 'Shared settings for Player 1 and Player 2',
        liveStyle: 'Use live match style',
        showTournamentLogo: 'Show tournament logo',
        showPlacementLogos: 'Show placement tournament logos',
        showSponsorLogo: 'Show team/sponsor logo',
        showPlayerPhoto: 'Show player photo',
        showCharacter: 'Show character',
        failedTitle: 'Unable to update Player Stats',
        failed: 'Player Stats settings could not be saved.'
      },
      // Versus Screen settings
      versusScreen: {
        showMatchBackdrop: 'Match information backdrop',
        matchBackdropHelp: 'Comparison and history rows keep their backgrounds.',
        statsHeading: 'Match comparison',
        statsHelp:
          'Choose the stats in the order you want them shown. Picking one already in use swaps the rows. Nicknames appear when both players have one saved in Players.',
        statRow: 'Row {{number}}',
        hiddenRow: 'Hidden',
        showHeadToHead: 'Show head-to-head results',
        startgg: 'start.gg head-to-head history',
        noSet: 'No match prepared',
        livePreview: 'Live preview',
        refreshHistory: 'Refresh history for these players',
        historyUpdated: 'History refreshed',
        historyUpdatedHelp: 'Head-to-head results were loaded from start.gg.',
        historyLoading: 'Loading head-to-head history…',
        historyFailed: 'History could not be refreshed. You can keep running the match and try again.',
        historyEntries: 'results loaded',
        startggProfileError: 'Choose a game and link both players to their start.gg profiles.',
        obsCurrent: 'OBS is up to date',
        obsPending: 'OBS will update in 1 second…',
        loadingScreenSettings: 'Loading Versus Screen settings…'
      },
      // Commentator settings
      commentator: {
        swap: 'Swap commentators',
        loading: 'Loading commentator presentation…',
        tournament: 'Tournament name',
        logo: 'Centered tournament logo',
        person: 'Commentator {{count}}',
        name: 'On-air name',
        handle: 'Social handle',
        presentTimed: 'Present for 10 seconds',
        showPersistent: 'Leave on screen',
        hide: 'Hide overlay',
        timed: 'Commentators will animate in and out over 10 seconds.',
        persistent: 'Commentators will remain visible.',
        hidden: 'Commentator presentation hidden.',
        failedTitle: 'Unable to update commentator overlay',
        failed: 'The commentator overlay could not be updated.'
      },
      // Winner and Champion settings
      resultScreen: {
        showTextBackdrop: 'Text backdrop',
        composition: 'Composition',
        classic: 'Classic',
        victory: 'Victory',
        spotlight: 'Spotlight',
        loading: 'Loading settings…',
        currentWinner: 'Current winner',
        winner: 'Set winner',
        champion: 'Champion',
        noWinner: 'Complete the match to show its winner',
        showTournamentLogo: 'Show tournament logo',
        showPlayerPhoto: 'Show player photo',
        showSponsorLogo: 'Show team/sponsor logo',
        showCharacter: 'Show character',
        unavailableForWinner: 'No image found.',
        failedTitle: 'Unable to update Winner/Champion screen',
        failed: 'The Winner/Champion presentation could not be updated.'
      },
      // Overlay descriptions
      tools: {
        playerStats: {
          title: 'Player Stats',
          description: 'Show either live player with five recent placements and their current tournament run.'
        },
        versus: {
          title: 'Versus Screen',
          description:
            'Present an exhibition matchup or a tournament match with recent placements and head-to-head history.',
          next: 'Choose an exhibition game in Edit stream state, or send a tournament set to stream.'
        },
        winner: {
          title: 'Winner & Champion Screen',
          description:
            'Celebrate a set winner or tournament champion with optional character art, player photo, and sponsor logo.'
        },
        commentators: {
          title: 'Commentator View',
          description: 'Present two on-air commentators and their social handles.'
        },
        topEightMatchups: {
          title: 'Top 8 Matchups',
          description:
            'Present the two opening Winners matches and two opening Losers matches with one character portrait per player.'
        },
        bracket: {
          title: 'Bracket View',
          description: 'Show a selected pool with Winners and Losers rounds, scores, and player flags.'
        }
      },
      // Graphic generator descriptions
      generators: {
        topEight: {
          title: 'Top 8 Generator',
          description: 'Create a top 8 graphic with character artwork or player photos.',
          emptyState: 'Choose a game and fill in the placements to create a Top 8 graphic.'
        },
        thumbnail: {
          title: 'YouTube Thumbnail Generator',
          description: 'Create a YouTube thumbnail with your own images and background.',
          emptyState: 'Choose a game and enter both players to create a thumbnail.'
        }
      }
    },

    // Utility groups
    utilityGroups: { moderation: 'Moderation', media: 'Media', bracket: 'Bracket', obs: 'OBS' },

    // start.gg connection and bracket browser
    startgg: {
      publicAccess: 'Public browsing',
      publicHelp:
        'Browse public tournaments and control your overlays without a token. Add one to report results to start.gg.',
      reportToken: 'Add a start.gg token to report results. You can still edit your overlay locally.',
      title: 'Start.gg bracket',
      description: 'Connect, load an event, and choose the next stream set.',
      verified: 'Verified',
      session: 'Session',
      stored: 'Stored',
      offline: 'Offline',
      apiAccess: 'API access',
      tokenLocal: 'JABS sends your token only to the start.gg developer API.',
      sessionStorage:
        'Secure credential storage is unavailable. You can use a token until JABS closes without saving it to disk.',
      tokenPlaceholder: 'Paste start.gg token',
      saveToken: 'Save token',
      useForSession: 'Use for session',
      removeToken: 'Remove token',
      tournament: 'Tournament',
      tournamentPlaceholder: 'Tournament slug or start.gg URL',
      loadEvents: 'Load events',
      unloadTournament: 'Unload tournament',
      unloadTournamentHint: 'Clear the loaded tournament, filters, set selector, and active stream state.',
      recent: 'Recent',
      recentAria: 'Recent tournaments',
      clearCache: 'Clear bracket history',
      clearCacheHint: 'Clear the bracket browser and recent tournament history.',
      activeStateStays: 'Active stream state stays on-air.',
      detectedProfile: 'Detected game profile',
      eventAria: 'Tournament event',
      selectEvent: 'Select event'
    },

    // Bracket browsing
    browser: {
      selectEvent: 'Select an event to reload bracket data.',
      updatedAt: 'Bracket Updated {{time}}',
      gameProfile: 'Game profile for set',
      assetSlug: 'Character asset folder:',
      reloadAssets: 'Reload assets',
      reloadAssetsHint: 'Rescan local artwork, photos, and logos.',
      assetsReloaded:
        'Assets reloaded · Character art: {{characterArt}} · Portraits: {{characterPortraits}} · Tournament logos: {{tournamentLogos}} · Sponsor logos: {{sponsorLogos}} · Player photos: {{playerPhotos}}',
      logosReloaded: '{{count}} tournament logo(s) found.',
      assetsReloadFailed: 'Unable to reload the local media catalogs.',
      chooseProfile: 'Choose game profile',
      detectedFromEvent: 'Detected from event: {{profile}}',
      unknownGame: 'This game uses an existing overlay profile. You can change it here; the game name and artwork stay the same.',
      phase: 'Phase',
      allPhases: 'All phases',
      pool: 'Pool / phase group',
      allPools: 'All pools in phase',
      stationNumber: 'Station number',
      stationPlaceholder: 'e.g. 3',
      browse: 'Browse',
      poolPages: 'Pool pages',
      allEventSets: 'All event sets',
      refresh: 'Refresh set selector',
      refreshHint: 'Fetch the latest sets for the current filters.'
    },

    // Set selection and filters
    selector: {
      open: 'Set Selector',
      pillFilters: 'Filter By:',
      pillFiltersHelp: 'Filters apply to loaded sets. Scroll to load more, or search to load every page.',
      statusFilter: 'Status',
      stationFilter: 'Station',
      streamFilter: 'Assigned stream',
      clearFilters: 'Clear filters',
      noFilterMatch: 'No loaded sets match these filters.',
      streamRefreshFailed: 'Stream assignments could not refresh. Previously loaded assignments are still shown.',
      title: 'Select set',
      view: '{{scope}} view',
      total: '{{count}} total',
      bracketOrder: 'start.gg bracket order',
      dirtyWarning: 'Stream changes are being saved automatically.',
      search: 'Search sets',
      searchPlaceholder: 'Player, round, station, or set ID',
      loadingAll: 'Loading every bracket page for search…',
      searchProgress: 'Searching the full bracket · page {{loaded}} of {{total}}. Results appear as they are found.',
      scanningFor: 'Searching remaining bracket pages for “{{query}}”…',
      searchAll: 'Search covers all {{count}} sets in this view.',
      focusSearch: 'Type a search to load matches from every bracket page.',
      searchView: 'Search covers this entire view.',
      regionAria: 'Loaded tournament sets',
      loadingSets: 'Loading sets…',
      none: 'No sets found in this view.',
      noMatch: 'No sets in this view match “{{query}}”.',
      tbd: 'TBD',
      winner: 'Winner',
      loser: 'Loser',
      setPages: 'Set pages',
      loadingMore: 'Loading more sets',
      scrollMore: 'Scroll to load more',
      allLoaded: 'All sets loaded',
      streamAssignment: '{{platform}} · {{name}}',
      streamPlatforms: { youtube: 'YouTube', twitch: 'Twitch', stream: 'Stream' },
      scope: { event: 'Event', phase: 'Phase', pool: 'Pool', station: 'Station {{number}}' }
    },

    // Stream match editor
    editor: {
      enableShortcuts: 'Enable keyboard shortcuts',
      selectMatch: 'Select a start.gg match before reloading it.',
      waitSave: 'Wait for your changes to save before using these controls.',
      waitAction: 'Wait for the current action to finish.',
      title: 'Edit stream state',
      description: 'Changes save automatically after JABS checks them, then update OBS.',
      unsaved: 'Unsaved',
      savePending: 'Saving shortly',
      saving: 'Updating OBS…',
      notSent: 'Not sent to OBS',
      gameProfile: 'Game profile',
      detectedGame: 'Detected game',
      styling: 'Scoreboard styling',
      scoreboardFont: 'Scoreboard font',
      fontSettingsLoading: 'Loading font settings…',
      fontSettingsRetrying: 'Reconnecting to font settings…',
      fontSaveFailed: 'Could not save the scoreboard font. Try again.',
      stylingDescription: 'Choose the scoreboard design. The game’s character choices stay the same.',
      detectedOverride: 'Detected from event: {{profile}}. You can override it after loading the set.',
      matchLength: 'Match length',
      displayName: 'Display name',
      round: 'Round',
      roundPlaceholder: 'e.g. Winners Final',
      station: 'Station',
      stationPlaceholder: 'e.g. Stream A',
      playerOne: 'Player 1',
      playerTwo: 'Player 2',
      save: 'Save stream state',
      discard: 'Discard draft',
      reload: 'Refresh current set',
      reloadHint:
        'Refresh this set’s players, scores, status, bracket details, and head-to-head history. Use this if an unplayed set still appears complete after a reset on start.gg.',
      playerTag: 'Player tag',
      prefix: 'Prefix',
      character: 'Character',
      characters: 'Characters',
      notShown: 'Not shown',
      unavailableCharacter: 'Unavailable: {{character}}',
      colorOutfit: 'Color / outfit',
      defaultOutfit: 'Default',
      selectCharacterFirst: 'Select a character first',
      noExtraOutfits: 'No extra outfits available',
      xHandle: 'x.com handle',
      state: 'State / province',
      chooseCountryFirst: 'Choose a country first',
      pronouns: 'Pronouns',
      seed: 'Seed',
      country: 'Country',
      displayFlag: 'Display flag',
      countrySearch: 'Search country, ISO code, or Pride flag'
    },

    // Broadcast details
    broadcast: {
      sharedLogoHelp: 'Uses the logo selected here, or the Broadcast extras logo if none is selected.',
      sponsorLogoHelp: 'Show each player’s team or sponsor logo when available.',
      title: 'Broadcast extras',
      enabled: '{{count}} enabled',
      optional: 'Optional rails and logo',
      showRails: 'Show lower information rails',
      leftRail: 'Left rail',
      leftPlaceholder: 'e.g. !bracket · matcherino',
      rightRail: 'Right rail',
      rightPlaceholder: 'e.g. twitch.tv/yourchannel',
      showLogo: 'Show tournament / sponsor logo',
      logo: 'Logo',
      useRailsLogo: 'Use rails logo',
      unavailableLogo: 'Unavailable: {{logo}}',
      chooseLogo: 'Choose logo',
      logoHint: 'Add PNG, JPEG, or WebP files to Tournament logos, then choose Reload assets.',
      reloadLogos: 'Reload logos',
      playerPhotosFolder: 'Player photos:',
      sponsorLogosFolder: 'Sponsor logos:',
      tournamentLogosFolder: 'Tournament logos:'
    },

    // Live match controls
    live: {
      title: 'Live Controls',
      dirtyWarning: 'Waiting for stream changes to finish autosaving.',
      startggResult: 'start.gg result',
      report: 'Report result',
      winner: '{{winner}} wins {{winnerScore}}–{{loserScore}}.',
      historyReady: 'Score history ready.',
      winnerOnly: 'Winner only; game order is unknown.',
      obsTitle: 'OBS URLs',
      obsHelp:
        'Keep JABS running while using its OBS sources. If a source stays blank, open its OBS properties and choose Refresh cache of current page.',
      resolvingObs: 'Loading the OBS URL…',
      copied: 'Copied',
      copyObs: 'Copy overlay URL',
      copiedOverlay: 'Copied: {{overlay}}',
      overlayNames: {
        stingers: 'Stingers',
        score: 'Scoreboard',
        versus: 'Versus Screen',
        'stats-player-1': 'Stats: Player 1',
        'stats-player-2': 'Stats: Player 2',
        winner: 'Winner & Champion',
        champion: 'Champion',
        'top-eight-matchups': 'Top 8 matchups',
        commentators: 'Commentators',
        bracket: 'Bracket'
      },
      playerOnePoint: '+1 Player 1',
      subtractPlayerOnePoint: '−1 Player 1',
      playerTwoPoint: '+1 Player 2',
      subtractPlayerTwoPoint: '−1 Player 2'
    },

    // Set actions
    setActions: {
      closeAria: 'Close set actions',
      send: 'Send to Stream',
      sendHelp: 'Show this match’s players and bracket details in OBS.',
      quick: 'Quick Score Update',
      loading: 'Loading set…',
      quickHelp: 'Score and report this bracket match without touching the on-air set.',
      alreadyComplete: 'This set is already marked complete on start.gg.',
      accepted: 'Accepted by start.gg',
      streamUnchanged: 'The active stream match was not changed.',
      bracketSet: 'Bracket set',
      historyWarning:
        'This set was loaded with a score but no game history. To report the exact score, reset it and record each game in order. Otherwise, JABS can report only the winner.',
      charactersFor: 'Characters · {{player}}',
      characterHelp: 'Choose characters before adding the game win. Clear this field to report no character.',
      mobileCharacterPrompt: 'Optional: Choose a character before adding a game win.',
      resultCheck: 'Result check',
      winner: '{{winner}} wins {{winnerScore}}–{{loserScore}}',
      reporting: 'Reporting…',
      confirm: 'Confirm & update bracket',
      safety:
        'JABS checks that start.gg has not changed this set before submitting. This never replaces the match currently shown in OBS.'
    },

    // Result reporting checks
    readiness: {
      alreadyComplete: 'This set is already marked complete on start.gg.',
      setMissing: 'Load a start.gg set before reporting a result.',
      exhibitionLocalOnly: 'Exhibition scores stay in JABS and cannot be reported to start.gg.',
      entrantsMissing: 'Both start.gg entrant IDs are required to report a result.',
      scoreIncomplete: 'Complete the local score first. This best-of-{{bestOf}} ends at {{target}} wins.',
      historyMismatch:
        'Recorded game history does not match the live score. Correct or reset the score before reporting.'
    },

    // Accessibility labels
    aria: {
      decreaseScore: 'Decrease {{player}} score',
      increaseScore: 'Increase {{player}} score'
    },

    // Custom scoreboard editor
    customScoreboard: {
      font: 'Font',
      sponsorColor: 'Sponsor color',
      flagSize: 'Flag size',
      title: 'Custom Scoreboard',
      description:
        'Use your own transparent scoreboard artwork while JABS keeps names, scores, flags, and broadcast details current.',
      name: 'Scoreboard name',
      image: 'Transparent scoreboard PNG',
      imageHelp: '1920×1080, up to 20 MB. Images up to 16 pixels off in either dimension are resized to fit.',
      import: 'Import scoreboard',
      savedScoreboards: 'Saved scoreboards',
      none: '---- Select ----',
      loadFailed: 'JABS could not load custom scoreboards.',
      imageLoadFailed: 'JABS could not load that scoreboard image. Try importing it again.',
      loadSetFirst: 'Send a set to stream before choosing a custom scoreboard.',
      chooseFileAndName: 'Choose a PNG and enter a scoreboard name.',
      imported: 'Custom scoreboard imported and selected for OBS.',
      importFailed: 'JABS could not import that scoreboard.',
      saved: 'Custom scoreboard layout saved.',
      saveFailed: 'JABS could not save the custom scoreboard layout.',
      deleteConfirm: 'Delete “{{name}}”? This cannot be undone.',
      deleted: 'Custom scoreboard deleted.',
      deleteFailed: 'JABS could not delete the custom scoreboard.',
      savedName: 'Layout name',
      adjustRegion: 'Selected field',
      mirrorToPlayer: 'Mirror to Player {{number}}',
      dragHelp:
        'Drag text or images to move them. Alt+click reaches overlapping fields. Arrow keys move; Shift moves 10px.',
      keyboardCanvas: 'Custom scoreboard positioning canvas',
      alignment: 'Text alignment',
      textColor: 'Text color',
      autosaveHelp: 'Changes save automatically.',
      autosave: {
        saved: 'All changes saved',
        saving: 'Saving layout…',
        incomplete: 'Check layout details',
        error: 'Changes not saved'
      },
      retry: 'Retry save',
      active: 'In use',
      useInObs: 'Use in OBS',
      useAutomatic: 'Use JABS styles',
      delete: 'Delete scoreboard',
      regions: {
        playerOneFlag: 'Player 1 · Flag',
        playerOneXHandle: 'Player 1 · x.com handle',
        playerOneName: 'Player 1 · Sponsor | name',
        playerOnePronouns: 'Player 1 · Pronouns',
        playerOneSeed: 'Player 1 · Seed',
        playerOneScore: 'Player 1 · Score',
        playerTwoFlag: 'Player 2 · Flag',
        playerTwoXHandle: 'Player 2 · x.com handle',
        playerTwoName: 'Player 2 · Name | sponsor',
        playerTwoPronouns: 'Player 2 · Pronouns',
        playerTwoSeed: 'Player 2 · Seed',
        playerTwoScore: 'Player 2 · Score',
        matchLabel: 'Round',
        logo: 'Tournament logo',
        infoLeft: 'Lower-left rail',
        infoCenter: 'Lower-center rail',
        infoRight: 'Lower-right rail'
      },
      align: { left: 'Left', center: 'Center', right: 'Right' },
      visibility: {
        flags: 'Show flags',
        sponsors: 'Show sponsors and prefixes',
        xHandles: 'Show x.com handles',
        pronouns: 'Show pronouns',
        seeds: 'Show seeds',
        round: 'Show round',
        tournamentLogo: 'Show tournament logo',
        bottomRails: 'Show lower rail details'
      },
      outlineLabel: 'Text outline',
      outline: { none: 'None', soft: 'Soft', strong: 'Strong' },
      typography: {
        nameSize: 'Player name',
        metaSize: 'Player details',
        scoreSize: 'Score',
        contextSize: 'Round and rails'
      }
    },

    // Top 8 Matchups
    topEightMatchups: {
      title: 'Top 8 Matchups',
      description:
        'Present the two opening Winners matches and two opening Losers matches with one character portrait per player.',
      eventName: 'Event name',
      detect: 'Find matchups from the loaded event',
      loading: 'Loading Top 8 Matchups settings…',
      retry: 'Try again',
      winners: 'Winners',
      losers: 'Losers',
      player: 'Player {{number}}',
      portrait: 'Character portrait',
      firstPage: 'Loading the first bracket page…',
      explicitPhase: 'Loading the “{{phase}}” phase…',
      topologyFallback: 'No Top 8 phase found. Checking the event bracket instead…',
      pages: 'Loading bracket pages {{start}}–{{end}} of {{total}}…',
      analyzePhase: 'Finding the four opening matches in “{{phase}}”…',
      analyzeEvent: 'Checking {{count}} event sets…',
      notDetected:
        'JABS could not identify a single Top 8 bracket. Check the event structure or enter the players manually.',
      tooLarge: 'This event is too large to check at once. Select its final phase or pool first.',
      detected: 'Loaded the four opening Top 8 matches.',
      unavailable: 'Top 8 Matchups settings are unavailable.',
      serializeFailed: 'JABS could not prepare the Top 8 Matchups settings.',
      invalidStyling: 'Choose a supported styling profile.',
      invalidCatalog: 'Choose a valid character portrait catalog.',
      invalidTournamentName: 'Enter a tournament name between 1 and 120 characters.',
      invalidMatchupCount: 'Top 8 Matchups requires exactly four matches.',
      invalidBracketOrder: 'Top 8 Matchups requires two Winners matches followed by two Losers matches.',
      invalidPlayerName: 'Enter a name between 1 and 100 characters for every player.',
      blockedCharacter:
        'That character name contains blocked text. Choose another character.',
      blockedTournamentName: 'The tournament name contains blocked text.',
      blockedEventName: 'The event name contains blocked text.',
      blockedPlayerName: 'A player name contains blocked text.',
      blockedSponsor: 'A sponsor contains blocked text.',
      preview: 'Top 8 Matchups preview',
      flipPlayerTwo: 'Flip all Player 2 portraits'
    },

    // Shared game selection and character folders
    generators: {
      previewFailed: 'Could not update the preview.',
      game: 'Game',
      characterFileGuides: 'Replace the empty character files with your artwork, keeping the same names.',
      preparingCharacters: 'Setting up character folders…',
      noCharacterRoster: 'No character list is available for this game. You can add your own artwork.',
      selectGame: 'Select a game',
      selectEvent: 'Select an event first',
      loadingGames: 'Loading games…',
      noGames: 'No games found',
      gamesFailed: 'Could not load the game list from start.gg. Reopen the list to try again.',
      cachedGames: 'Using the saved game list.',
      unnamedGame: 'Game {{id}}'
    },

    // Graphic backgrounds
    graphicBackground: {
      title: 'Custom background',
      choose: 'Choose image',
      remove: 'Remove background',
      none: 'No custom background',
      hint: 'PNG, JPEG, or WebP. Up to 15 MB, 8192×8192, and 40 megapixels.',
      failed: 'JABS could not use this background image.'
    },

    // Artwork positioning
    mediaControls: {
      combinedEditingHelp: 'Alt+click selects the image behind.',
      pointer: 'Drag an image, or use:',
      move: 'move',
      moveFarther: 'move farther',
      resize: 'resize',
      flip: 'flip'
    },

    // Top 8 graphic generator
    topEight: {
      description: 'Create a Top 8 graphic from event results or fill in the placements yourself.',
      ready: 'Preview ready',
      draft: 'Needs details',
      game: 'Game',
      style: 'Composition style',
      styles: { mosaic: 'Mosaic', neon: 'Neon' },
      mediaMode: 'Top 8 artwork',
      mediaModes: { character: 'Character art', photo: 'Player photos', combined: 'Character + photo' },
      adjustLayer: 'Adjust entrant artwork',
      resetPlacement: 'Reset position',
      tournament: 'Tournament name (optional)',
      headline: 'Headline (optional)',
      headlineColor: 'Headline color',
      tournamentLogo: 'Tournament logo',
      noLogo: 'No tournament logo',
      nowDownloading: 'Now downloading…',
      eventUrl: 'Completed start.gg event URL',
      loadEventUrl: 'Load event Top 8',
      loadFromStartgg: 'Load from start.gg',
      manualEventDetails: 'Manual event details',
      manualEventUrl: 'Event link',
      manualEventUrlHint: 'Shown at the bottom of the exported PNG when filled.',
      participantCount: 'Number of participants',
      standingsLoaded: 'Loaded the final results for {{event}}. You can still edit each player.',
      standingsNotFinal:
        'start.gg does not yet report eight finalized standings for this event. The manual Top 8 remains unchanged.',
      standingsNotConventional:
        'This event does not use the conventional 1st, 2nd, 3rd, 4th, tied 5th, tied 7th order. The manual Top 8 remains unchanged.',
      standingsFailed: 'JABS could not load this event’s finalized standings.',
      downloadPng: 'Download 1920×1080 PNG',
      downloadFailed: 'JABS could not generate the Top 8 PNG.',
      assetsMatched: 'Character images found: {{count}}',
      assetFolder: 'Character artwork:',
      portraitFolder: 'Character portraits:',
      preview: 'Live preview',
      previewQuality: 'PNG exports use your original artwork at 1920×1080.',
      placements: 'Top 8 placements',
      placement: 'Placement {{count}}',
      playerTag: 'Player tag',
      character: 'Character',
      characters: 'Characters',
      sponsor: 'Sponsor / prefix',
      xHandle: 'x.com handle',
      country: 'Country',
      displayFlag: 'Display flag',
      validation: {
        entrantCount: 'Enter exactly eight players for the Top 8.',
        placements:
          'Placements must use conventional double-elimination order: 1st, 2nd, 3rd, 4th, tied 5th, and tied 7th.',
        playerTag: 'Enter a name for every player.'
      }
    },

    // YouTube thumbnail generator
    thumbnail: {
      description: 'Create a YouTube thumbnail using the stream match or your own player details.',
      ready: 'Ready to export',
      needsDetails: 'Needs details',
      game: 'Game',
      style: 'Composition style',
      styles: { versus: 'Versus', spotlight: 'Spotlight' },
      mediaMode: 'Player artwork',
      mediaModes: { character: 'Character art', photo: 'Player photos', combined: 'Character + photo' },
      assetFolder: 'Character artwork:',
      portraitFolder: 'Character portraits:',
      tournament: 'Tournament name (optional)',
      headline: 'Phase · Round (optional)',
      headlineColor: 'Phase · Round color',
      logo: 'Tournament logo',
      noLogo: 'No tournament logo',
      useStreamMatch: 'Use match on stream',
      autoStreamMatch:
        'Sending a tournament match to stream fills in its players and match details. Use the button to copy an exhibition or refresh the current match.',
      preview: 'Live preview',
      downloadPng: 'Download 1280×720 PNG',
      downloadFailed: 'JABS could not generate the thumbnail PNG.',
      player: 'Player {{count}}',
      adjustLayer: 'Adjust media asset',
      adjustCharacter: '{{player}} · Character',
      adjustPhoto: '{{player}} · Player photo',
      mediaScale: 'Media size',
      resetPlacement: 'Reset position',
      showTournamentLogo: 'Show tournament logo',
      showSponsorLogo: 'Show sponsor logo'
    },

    // Moderation controls
    moderation: {
      title: 'Moderation exceptions',
      description:
        'Allow complete names or field values that were blocked by mistake.',
      path: 'File:',
      open: 'Edit allowlist',
      openHint: 'Edit moderation exceptions in JABS.',
      reload: 'Reload allowlist',
      reloadHint: 'Re-read changes made outside JABS.',
      editorTitle: 'Edit moderation allowlist',
      editorDescription:
        'Add one complete name or field value per line. Protected terms cannot be allowed. Lines starting with # are comments.',
      editorLabel: 'Moderation allowlist entries',
      cancel: 'Cancel',
      save: 'Save',
      saved_one: 'Moderation allowlist saved with {{count}} exception.',
      saved_other: 'Moderation allowlist saved with {{count}} exceptions.',
      reloaded_one: 'Moderation allowlist reloaded with {{count}} exception.',
      reloaded_other: 'Moderation allowlist reloaded with {{count}} exceptions.',
      openFailed: 'JABS could not open the moderation allowlist.',
      saveFailed: 'JABS could not save the moderation allowlist.',
      reloadFailed: 'JABS could not reload the moderation allowlist.',
      fileTooLarge: 'The moderation allowlist must be 256 KiB or smaller.',
      tooManyEntries: 'The moderation allowlist supports at most 4,096 entries.',
      lineTooLong: 'Moderation allowlist line {{line}} exceeds 256 characters.',
      protectedEntry: 'Line {{line}} contains a protected term and cannot be allowed.'
    },

    // Notification labels
    notices: {
      connection: 'Connection',
      dismiss: 'Dismiss notification',
      actionFailed: 'Action failed',
      checkThis: 'Check this',
      done: 'Done',
      notice: 'Notice'
    },

    // Action confirmations and results
    messages: {
      exportCompleted: 'Export complete: {{filename}}',
      openLinkFailed: 'Could not open this link in your browser.',
      // Bracket search
      loadSearch: 'Unable to load every bracket page for search.',

      // Token storage
      enterToken: 'Enter a start.gg token first.',
      sessionTokenSaved: 'The token will be kept until JABS closes. Load a tournament to verify it with start.gg.',
      tokenSaved: 'Token saved in OS credential storage. Load a tournament to verify it with start.gg.',
      saveTokenFailed: 'Unable to save token.',
      tokenRemoved: 'start.gg token removed from this device.',
      removeTokenFailed: 'Unable to remove token.',

      // Tournament loading and cache
      tournamentUnloaded: 'Tournament unloaded. The stream match has been cleared.',
      exhibitionGameFailed: 'Could not change the exhibition game. Try selecting it again.',
      tournamentUnloadFailed: 'Unable to unload the tournament and clear the active stream state.',
      clearCacheConfirm:
        'Clear recent tournament history and reset the bracket browser? Your on-air match and saved match edits will be kept.',
      cacheCleared:
        'Bracket browser and recent tournament history cleared. Your on-air match and saved match edits were kept.',
      clearCacheFailed: 'Unable to clear bracket history.',
      tournamentRequired: 'Enter a tournament slug or start.gg URL first.',
      recentHistoryNotSaved: 'The tournament loaded, but JABS could not save it to Recent tournaments.',
      noEvents:
        'No events were found. Check the tournament slug or URL and confirm the tournament is visible on start.gg.',
      loadEventsFailed: 'Unable to load events.',

      // Bracket browsing
      loadedPhases: 'Loaded {{count}} phases.',
      phasesFailed: 'Phases: {{message}}',
      loadPhasesFailed: 'Unable to load phases.',
      showingEventSets: 'Showing {{shown}} of {{total}} event sets.',
      showingPhaseSets: 'Showing {{shown}} of {{total}} phase sets.',
      setsFailed: 'Sets: {{message}}',
      loadSetsFailed: 'Unable to load sets.',
      selectEvent: 'Select an event first.',
      loadedPools: 'Loaded {{shown}} of {{total}} pools.',
      poolsFailed: 'Pools: {{message}}',
      loadPoolsFailed: 'Unable to load phase groups.',
      selectPhase: 'Select a phase first.',
      positiveStation: 'Enter a positive station number.',
      showingScopeSets: 'Showing {{shown}} of {{total}} {{scope}} sets.',

      // Quick score reporting
      quickLoadFailed: 'Unable to load this set for quick scoring.',
      quickSetRequired: 'Load a set for quick scoring first.',
      quickConfirm:
        'Quick report {{winner}} as the winner on start.gg?\n\n{{playerOne}} {{scoreOne}}–{{scoreTwo}} {{playerTwo}}\nSet ID: {{setId}}\n\nThis updates the live bracket without changing the on-stream match.',
      quickReceipt: '{{winner}} won {{winnerScore}}–{{loserScore}}. start.gg accepted set {{setId}}{{completion}}.',
      markedComplete: ' and marked it complete',
      quickReportFailed: 'Unable to quick-report this set to start.gg.',

      // Stream edits and result reporting
      selectSetFailed: 'Unable to select set.',
      streamSaved: 'Stream changes saved and sent to OBS.',
      saveStreamFailed: 'Unable to save stream state.',
      reportSetRequired: 'Load a start.gg set before reporting a result.',
      reportConfirm:
        'Report {{winner}} as the winner on start.gg?\n\n{{playerOne}} {{scoreOne}}–{{scoreTwo}} {{playerTwo}}\n{{history}}Set ID: {{setId}}\n\nThis changes the live bracket and may advance entrants.',
      reportHistoryExact: 'The recorded {{count}}-game history will also report the set score.\n',
      reportHistoryWinnerOnly:
        'Only the winner can be reported because this set was loaded with a score but no record of the games played.\n',
      reportExactSuccess: '{{winner}} and the {{winnerScore}}–{{loserScore}} score were reported on start.gg.',
      characterSelectionsReported: 'Character selections included: {{count}}.',
      reportWinnerSuccess:
        '{{winner}} was reported as the winner on start.gg. The score was not sent because the order of games was unknown.',
      selectorRefreshFailed: 'The set list could not update. Choose Refresh set selector to try again.',
      reportFailed: 'Unable to report the set to start.gg.',

      // Refresh the streamed set
      reloadConfirm:
        'Refresh this set’s players, scores, round, station, and Versus history from start.gg? The current game profile, styling, and broadcast extras stay selected.',
      reloadSuccess: 'Current set and Versus history refreshed from start.gg.',
      reloadSetSuccess: 'Current set refreshed.',
      reloadSetOnly: 'Current set refreshed. Head-to-head history requires linked start.gg player profiles.',
      reloadHistoryFailed: 'The current set refreshed, but its Versus history did not.',
      reloadFailed: 'Unable to refresh this set from start.gg.',

      // Live controls
      scoreFailed: 'Unable to update score.',
      scoresReset: 'Scores reset.',
      playersSwapped: 'Player sides swapped.',
      commentatorsSwapped: 'Commentator sides swapped.',
      stateFailed: 'Unable to update stream state.',

      // OBS URLs
      obsCopied: 'OBS overlay URL copied.',
      copyFailed: 'Unable to copy the local URL.'
    }
  },
  // Application and start.gg errors
  errors: {
    nativeFailure: 'Could not complete this action. Check the details and try again.',
    invalidLocalResponse: 'The local service returned an invalid response for {{source}}.',
    realtimeConnection: 'Realtime connection interrupted. Reconnecting…',

    generic: 'Something went wrong.',
    localSettings: 'Unable to load local app settings.',
    updateScore: 'Unable to update score.',
    updateState: 'Unable to update stream state.',
    copyUrl: 'Unable to copy the local URL.',
    invalidPort: 'JABS received an invalid local API port.',
    desktopTokenOnly: 'Token management is available only inside the JABS desktop app.',
    localService:
      "JABS's local service stopped responding at {{url}}. Restart the desktop app and try again. You can find the diagnostic log, jabs-main.log, in the app's data folder.",
    localServiceAfterRetry:
      "JABS's local service stopped responding at {{url}} after a retry. Restart the desktop app and try again. You can find the diagnostic log, jabs-main.log, in the app's data folder.",
    http: 'Request failed with HTTP {{status}}',
    // start.gg error messages
    startgg: {
      playerReference: 'Enter a start.gg profile URL, profile code, or numeric player ID.',
      playerNotFound: 'No player profile was found. Check the link or player ID.',
      publicUnavailable:
        'Public start.gg access could not load this data. Try again, or add a token in API access. Your local overlay controls still work.',
      tokenMissing: 'Add a start.gg token to report results. Local overlay controls do not need one.',
      authentication: 'start.gg rejected the token. Check that it is current, then save it again.',
      permission: 'This start.gg token does not have permission for the requested tournament action.',
      rateLimit: 'The start.gg rate limit was reached. Wait about a minute before trying again.',
      queryComplexity: 'start.gg rejected this request as too complex. Narrow the bracket view and try again.',
      timeout: 'start.gg took too long to respond. Try again.',
      network: 'JABS could not reach start.gg. Check the internet connection and try again.',
      upstream:
        'The start.gg API returned a temporary server error. The website may still be online; try loading again shortly.',
      invalidResponse: 'JABS could not read the data returned by start.gg.',
      graphql: 'start.gg rejected the bracket request. Check the selected tournament data and permissions.',
      conflict: 'This set changed after you opened it. Reopen it and review the latest result.'
    }
  }
} as const;

type DeepStringShape<Value> = {
  [Key in keyof Value]: Value[Key] extends string ? string : DeepStringShape<Value[Key]>;
};

export type LocaleCatalog = DeepStringShape<typeof en>;
