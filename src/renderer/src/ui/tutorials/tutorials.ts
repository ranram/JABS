import type { en } from '../../i18n/catalogs/en';

export type TutorialWorkspace = 'bracket' | 'custom-scoreboard' | 'overlays' | 'stingers' | 'top-eight' | 'thumbnail';
export type TutorialStep = {
  id: keyof typeof en.operator.help.steps;
  target: string;
  fallbackTarget?: string;
  workspace?: TutorialWorkspace;
  openLibrary?: boolean;
  openQueue?: boolean;
  openMenu?: 'matches' | 'assets';
  link?: string;
};

const target = (name: string) => `[data-tutorial="${name}"]`;
const obs: TutorialStep = { id: 'obs', target: target('obs') };
const assets: TutorialStep = { id: 'assets', target: target('assets') };

export const tutorials = {
  quickStart: [
    { id: 'quickWelcome', target: '.workspace-sticky-header', workspace: 'bracket' },
    { id: 'tokenPurpose', target: target('api-access'), link: 'https://developer.start.gg/docs/authentication/' },
    { id: 'quickTournament', target: '.tournament-lookup-row' },
    { id: 'quickExhibition', target: target('bracket-options') },
    { id: 'quickAssets', target: target('assets') },
    { id: 'quickStream', target: '.editor-panel', fallbackTarget: '.startgg-panel' },
    { id: 'quickReporting', target: target('report-result'), fallbackTarget: target('api-access') },
    obs,
    { id: 'quickLibrary', target: target('players'), openMenu: 'matches' },
    { id: 'quickFinish', target: target('help') }
  ],
  tournament: [
    { id: 'tournament', target: '.tournament-lookup-row', workspace: 'bracket' },
    { id: 'event', target: target('event') },
    { id: 'sets', target: '.set-list' },
    { id: 'stream', target: '.editor-panel' },
    obs
  ],
  matchQueue: [
    { id: 'queueAdd', target: '.set-list', fallbackTarget: '.tournament-lookup-row', workspace: 'bracket' },
    { id: 'queueOpen', target: target('queue-open'), openMenu: 'matches' },
    { id: 'queueOrder', target: target('queue-list'), openQueue: true },
    { id: 'queueModes', target: target('queue-settings'), openQueue: true },
    { id: 'queuePlayback', target: target('queue-playback'), openQueue: true },
    { id: 'queueEdit', target: target('queue-list'), openQueue: true },
    { id: 'queueTiming', target: target('queue-settings'), openQueue: true },
    { id: 'queueSaved', target: target('queue-panel'), openQueue: true }
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
    { id: 'library', target: target('players'), openMenu: 'matches' },
    { id: 'libraryFind', target: '[data-tutorial="player-library-create"]', openLibrary: true },
    { id: 'librarySelect', target: '.player-library-list', openLibrary: true },
    { id: 'libraryDefaults', target: '.player-library-workspace', openLibrary: true },
    { id: 'libraryBackup', target: '.player-library-file-actions', openLibrary: true }
  ],
  media: [
    { id: 'media', target: '.thumbnail-generator .generator-preview-panel', workspace: 'thumbnail' },
    { id: 'mediaSelect', target: '.thumbnail-generator .generator-preview-panel' },
    { id: 'mediaMove', target: '.thumbnail-generator .generator-preview-panel' },
    { id: 'mediaReset', target: '.thumbnail-generator .generator-preview-panel' }
  ],
  folders: [
    { id: 'assetFolders', target: target('assets') },
    { id: 'assetCharacters', target: target('assets') },
    { id: 'assetPhotos', target: target('assets') },
    { id: 'assetLogos', target: target('assets') },
    { id: 'assetReload', target: target('reload-assets'), openMenu: 'assets' }
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
export const tutorialIds = [
  'quickStart', 'tokens', 'tournament', 'matchQueue', 'exhibition', 'library', 'folders', 'media',
  'scoreboard', 'stingers', 'topEight', 'thumbnail'
] as const satisfies readonly TutorialId[];
