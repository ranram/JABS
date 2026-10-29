// Only these fixed labels reach logs; query values and record IDs stay in requests.
export const requestOperations = {
  '/api/match-queue': 'queue-read',
  '/api/match-queue/add': 'queue-add',
  '/api/match-queue/action': 'queue-action',
  '/api/match-queue/heartbeat': 'queue-heartbeat',
  '/api/health': 'health',
  '/api/state': 'overlay-state',
  '/api/state/selected-set': 'selected-set',
  '/api/state/exhibition-game': 'exhibition-game',
  '/api/state/score': 'score',
  '/api/state/scores/reset': 'scores-reset',
  '/api/state/players/swap': 'players-swap',
  '/api/state/players/clear': 'players-clear',
  '/api/settings/appearance': 'appearance-settings',
  '/api/scoreboard-photos': 'scoreboard-photos',
  '/api/scoreboard-photos/resolve': 'scoreboard-photos-resolve',
  '/api/broadcast/stingers': 'stingers',
  '/api/broadcast/stingers/play': 'stinger-play',
  '/api/broadcast/stingers/stop': 'stinger-stop',
  '/api/broadcast/stingers/claim': 'stinger-claim',
  '/api/broadcast/stingers/finish': 'stinger-finish',
  '/api/broadcast/stingers/reconnect': 'stinger-reconnect',
  '/api/broadcast/stingers/source': 'stinger-source',
  '/api/broadcast/player-stats': 'player-stats',
  '/api/broadcast/player-stats/settings': 'player-stats-settings',
  '/api/broadcast/bracket-screen': 'bracket-screen',
  '/api/broadcast/bracket-screen/refresh': 'bracket-refresh',
  '/api/broadcast/commentators': 'commentators',
  '/api/broadcast/result-screen': 'result-screen',
  '/api/broadcast/versus-screen': 'versus-screen',
  '/api/broadcast/versus-screen/history': 'versus-history',
  '/api/broadcast/top-eight-matchups': 'top-eight-matchups',
  '/api/players': 'players',
  '/api/players/lookup': 'players-lookup',
  '/api/players/import': 'players-import',
  '/api/players/resolve': 'players-resolve',
  '/api/players/import-event': 'players-import-event',
  '/api/assets/check': 'assets-check',
  '/api/assets/reload': 'assets-reload',
  '/api/assets/logos': 'asset-logos',
  '/api/assets/catalog-summary': 'asset-catalog',
  '/api/assets/player-media': 'player-media',
  '/api/assets/identity-media': 'identity-media',
  '/api/assets/game-characters': 'game-characters',
  '/api/assets/game-characters/prepare': 'game-characters-prepare',
  '/api/custom-scoreboards': 'custom-scoreboards',
  '/api/custom-scoreboards/import': 'custom-scoreboard-import',
  '/api/locations/countries': 'countries',
  '/api/locations/states': 'states',
  '/api/game-profiles': 'game-profiles',
  '/api/moderation/text': 'moderation-text',
  '/api/startgg/videogames': 'startgg-videogames',
  '/api/startgg/recent-tournaments': 'recent-tournaments',
  '/api/startgg/cache': 'startgg-cache',
  '/api/startgg/events': 'startgg-events',
  '/api/startgg/event-standings': 'startgg-standings',
  '/api/startgg/stream-queue': 'startgg-stream-queue',
  '/api/startgg/phases': 'startgg-phases',
  '/api/startgg/phase-groups': 'startgg-phase-groups',
  '/api/startgg/sets': 'startgg-sets',
  '/api/startgg/select-set': 'startgg-select-set',
  '/api/startgg/inspect-set': 'startgg-inspect-set',
  '/api/startgg/report-set': 'startgg-report-set',
  '/api/startgg/quick-report-set': 'startgg-quick-report-set'
} as const;

export const queueOperations = {
  start: 'queue-start',
  pause: 'queue-pause',
  resume: 'queue-resume',
  previous: 'queue-previous',
  next: 'queue-next',
  clear: 'queue-clear',
  jump: 'queue-jump',
  remove: 'queue-remove',
  reorder: 'queue-reorder',
  settings: 'queue-settings'
} as const;

export const nativeOperations = {
  get_api_port: 'get-api-port',
  get_token_status: 'get-token-status',
  set_startgg_token: 'set-startgg-token',
  set_session_startgg_token: 'set-session-startgg-token',
  clear_startgg_token: 'clear-startgg-token',
  open_external_url: 'open-external-url',
  get_media_directories: 'get-media-directories',
  open_media_directory: 'open-media-directory',
  get_moderation_allowlist: 'get-moderation-allowlist',
  save_moderation_allowlist: 'save-moderation-allowlist',
  reload_moderation_allowlist: 'reload-moderation-allowlist',
  diagnostic_report: 'diagnostic-report',
  open_logs_directory: 'open-logs-directory',
  open_support_email: 'open-support-email',
  show_bracket_menu: 'show-bracket-menu',
  get_update_support: 'get-update-support',
  restart_app: 'restart-app'
} as const;

export const dynamicOperations = [
  'player-record',
  'custom-scoreboard-record',
  'stinger-video',
  'asset-image',
  'other-local-request',
  'other-native-command'
] as const;
type Values<T> = T[keyof T];
export type DiagnosticOperation =
  | Values<typeof requestOperations>
  | Values<typeof queueOperations>
  | Values<typeof nativeOperations>
  | (typeof dynamicOperations)[number];
export type DiagnosticMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'OTHER';

export function requestOperation(path: string): DiagnosticOperation {
  const route = path.split(/[?#]/, 1)[0];
  if (Object.hasOwn(requestOperations, route)) return requestOperations[route as keyof typeof requestOperations];
  if (/^\/api\/players\/[^/]+$/.test(route)) return 'player-record';
  if (/^\/api\/custom-scoreboards\/[^/]+$/.test(route)) return 'custom-scoreboard-record';
  if (/^\/api\/broadcast\/stingers\/video\/(perfect|winner)$/.test(route)) return 'stinger-video';
  if (route.startsWith('/assets/')) return 'asset-image';
  return 'other-local-request';
}

export function nativeOperation(command: string): DiagnosticOperation {
  return Object.hasOwn(nativeOperations, command)
    ? nativeOperations[command as keyof typeof nativeOperations]
    : 'other-native-command';
}
