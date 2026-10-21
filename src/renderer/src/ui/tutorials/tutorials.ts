import type { en } from '../../i18n/catalogs/en';

export type TutorialWorkspace = 'bracket' | 'custom-scoreboard' | 'overlays' | 'stingers' | 'top-eight' | 'thumbnail';
export type TutorialStep = {
  id: keyof typeof en.operator.help.steps;
  target: string;
  workspace?: TutorialWorkspace;
  openLibrary?: boolean;
  link?: string;
};

const target = (name: string) => `[data-tutorial="${name}"]`;
const obs: TutorialStep = { id: 'obs', target: target('obs') };
const assets: TutorialStep = { id: 'assets', target: target('assets') };

export const tutorials = {
  tournament: [
    { id: 'tournament', target: '.tournament-lookup-row', workspace: 'bracket' },
    { id: 'event', target: target('event') },
    { id: 'sets', target: '.set-list' },
    { id: 'stream', target: '.editor-panel' },
    obs
  ],
  exhibition: [
    { id: 'exhibition', target: target('bracket-options'), workspace: 'bracket' },
    { id: 'game', target: '.editor-panel' },
    { id: 'players', target: '.editor-panel .player-field-row' },
    { id: 'scores', target: '.grid-layout .preview-panel' },
    obs
  ],
  topEight: [
    { id: 'topEight', target: target('top-eight-setup'), workspace: 'top-eight' },
    assets,
    { id: 'placements', target: '.top8-entrants-panel' },
    { id: 'topEightExport', target: '.top8-preview-panel' }
  ],
  thumbnail: [
    { id: 'thumbnail', target: target('thumbnail-setup'), workspace: 'thumbnail' },
    assets,
    { id: 'thumbnailPlayers', target: '.thumbnail-generator .generator-editor-column' },
    { id: 'thumbnailExport', target: '.thumbnail-generator .generator-preview-panel' }
  ],
  tokens: [
    { id: 'tokenPurpose', target: target('api-access') },
    { id: 'tokenCreate', target: target('api-access'), link: 'https://developer.start.gg/docs/authentication/' },
    { id: 'tokenStorage', target: target('api-access') },
    { id: 'reporting', target: target('api-access') }
  ],
  library: [
    { id: 'library', target: target('players') },
    { id: 'libraryFind', target: '.player-library-toolbar', openLibrary: true },
    { id: 'librarySelect', target: '.player-library-list', openLibrary: true },
    { id: 'libraryDefaults', target: '.player-library-workspace', openLibrary: true },
    { id: 'libraryBackup', target: '.player-library-toolbar', openLibrary: true }
  ],
  media: [
    { id: 'media', target: '.thumbnail-generator .generator-preview-panel', workspace: 'thumbnail' },
    { id: 'mediaSelect', target: '.thumbnail-generator .generator-preview-panel' },
    { id: 'mediaMove', target: '.thumbnail-generator .generator-preview-panel' },
    { id: 'mediaReset', target: '.thumbnail-generator .generator-preview-panel' }
  ],
  scoreboard: [
    { id: 'scoreboard', target: '.custom-scoreboard-library-controls', workspace: 'custom-scoreboard' },
    { id: 'scoreboardLayout', target: '.custom-scoreboard-workspace' },
    { id: 'scoreboardRails', target: '.custom-scoreboard-workspace' },
    { id: 'scoreboardSave', target: '.custom-scoreboard-workspace' },
    obs
  ],
  stingers: [
    { id: 'stingers', target: target('stingers'), workspace: 'stingers' },
    { id: 'stingerFraming', target: target('stingers') },
    { id: 'stingerObs', target: target('stingers') },
    { id: 'stingerPlay', target: target('stinger-menu') }
  ]
} as const satisfies Record<string, readonly TutorialStep[]>;

export type TutorialId = keyof typeof tutorials;
export const tutorialIds = Object.keys(tutorials) as TutorialId[];
