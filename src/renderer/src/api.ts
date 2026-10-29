import { recordDiagnostic, setOverlayDiagnosticTransport, type DiagnosticEvent } from './diagnostics';
import { libraryLookupSchema, libraryImportSchema, libraryPlayerSchema, librarySaveSchema, librarySearchSchema, libraryResolveSchema, playerImportPageSchema, type LibraryPlayer, type LibraryIdentity } from '@shared/playerLibrary';
import { appearancePreferencesSchema, type AppearancePreferences } from '@shared/appearancePreferences';
import { gameCharacterPreparationSchema, startggVideogamesSchema, type GameCharacterPreparation } from '@shared/startggVideogames';
import { invalidateCatalogConsumers, requestGameFolderCheck } from './hooks/useCatalogRevision';
import { stingerStateSchema, stingerClaimSchema, type StingerSettings, type StingerKind } from '@shared/stingers';
import { assetCatalogMessageSchema, assetCatalogRevisionSchema, assetCatalogCheckSchema } from '@shared/assetCatalog';
import { bracketScreenStateSchema, type BracketSettings } from '@shared/bracketScreen';
import { parseRealtimeJson } from './hooks/realtime';
import type {
  AppHealth,
  ExhibitionGameSelection,
  AssetCatalogSummary,
  CountryOption,
  GameCharacterAsset,
  IdentityMediaInput,
  LogoAsset,
  OverlayMediaMatches,
  OverlayState,
  RecentTournament,
  SelectedSetState,
  ReportOutcome,
  StartggEventsResult,
  StartggEventStandingsResult,
  StartggPhaseGroupsResult,
  StartggPhasesResult,
  StartggQuickReportResult,
  StartggReportResult,
  StartggSelectionResult,
  StartggSetInspectionResult,
  StartggStreamQueueResult,
  StartggSetScope,
  StartggSetsResult,
  StateOption,
  TokenStatus
} from '@shared/models';
import type { GameProfile } from '@shared/gameProfiles';
import type { StartggQuickReportInput } from '@shared/startggGateway';
import { commentatorStateSchema, type CommentatorState } from '@shared/commentators';
import { resultScreenStateSchema, type ResultScreenState } from '@shared/resultScreen';
import { versusScreenStateSchema, type VersusScreenState } from '@shared/versusScreen';
import { playerStatsSchema, type StatsPlayer } from '@shared/playerStats';
import { playerStatsSettingsSchema, type PlayerStatsSettings } from '@shared/playerStatsSettings';
import { topEightMatchupsStateSchema, type TopEightMatchupsState } from '@shared/topEightMatchups';
import { overlayStateSchema } from '@shared/overlayState';
import {
  customScoreboardListSchema,
  customScoreboardSchema,
  type CustomScoreboard
} from '@shared/customScoreboards';
import { gameProfiles as gameProfileCatalog } from '@shared/gameProfiles';
import { withJsonBodyHeaders } from './requestInit';
import { BoundedPromiseCache } from './boundedPromiseCache';
import { trimTransparentPadding } from './trimTransparentPadding';
import { blobDataUrl } from './blobDataUrl';
import { RequestTrace, httpFailureReason, requestFailureReason } from './requestDiagnostics';
import { createLocalApiTransport } from './localApiTransport';
export { LocalApiError } from './localApiTransport';
import { scoreboardPhotoSettingsSchema, resolvedScoreboardPhotosSchema, type ScoreboardPhotoSettings, type ScoreboardPhotoIdentity } from '@shared/scoreboardPhotos';
import { localizedNativeError } from './i18n/nativeErrors';
import {
  clearNativeStartggToken,
  copyOverlayUrl,
  getDesktopApiPort,
  getNativeTokenStatus,
  type LocalHandoffUrl,
  setNativeStartggToken
} from './desktopRuntime';

const urlParams = new URLSearchParams(window.location.search);

async function resolveApiBase(): Promise<string> {
  const queryPort = urlParams.get('apiPort');
  if (queryPort) {
    const port = Number(queryPort);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new Error('JABS received an invalid local API port.');
    }
    return `http://127.0.0.1:${port}`;
  }

  const desktopPort = await getDesktopApiPort();
  if (desktopPort !== undefined) {
    const port = desktopPort;
    return `http://127.0.0.1:${port}`;
  }

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return window.location.origin;
  }

  return window.location.origin;
}

const apiBasePromise = resolveApiBase();
const { request, performRequest } = createLocalApiTransport(apiBasePromise);
export { request, performRequest };
if (window.location.pathname.startsWith('/overlay')) {
  setOverlayDiagnosticTransport(async (event, context) => {
    const base = await apiBasePromise;
    await fetch(`${base}/api/diagnostics/renderer`, withJsonBodyHeaders({
      method: 'POST', body: JSON.stringify({ event, context })
    }));
  });
}
const catalogRasterUrls = new BoundedPromiseCache<string>(96);
const gamePreparationRequests = new Map<string, Promise<GameCharacterPreparation>>();
const customScoreboardFrameUrls = new BoundedPromiseCache<string>(4);
let nativeCatalogRevision: number | undefined;

function applyCatalogRevision(revision: number): void {
  // Several state hooks share this stream. Refresh each page only once per reload.
  if (nativeCatalogRevision === revision) return;
  nativeCatalogRevision = revision;
  invalidateCatalogRasterCache({ recheckGameFolders: false });
}

export function acceptCatalogMessage(value: unknown): boolean {
  const message = parseRealtimeJson(value, (payload) => {
    const result = assetCatalogMessageSchema.safeParse(payload);
    return result.success ? result.data : undefined;
  });
  if (!message) return false;
  applyCatalogRevision(message.revision);
  return true;
}

export function invalidateCatalogRasterCache({ recheckGameFolders = true } = {}): void {
  catalogRasterUrls.clear();
  customScoreboardFrameUrls.clear();
  invalidateCatalogConsumers(recheckGameFolders);
}

async function cachedRasterUrl(cache: BoundedPromiseCache<string>, path: string, trimPadding = false): Promise<string> {
  return cache.getOrCreate(path, async () => {
    const apiBase = await apiBasePromise;
    const trace = new RequestTrace(path);
    let response: Response;
    try {
      response = await fetch(`${apiBase}${path}`);
    } catch (error) {
      trace.record('image-failed', requestFailureReason(error));
      throw error;
    }
    if (!response.ok) {
      trace.record('image-failed', httpFailureReason(response.status), response.status);
      throw new Error(`Local image request failed (${response.status}).`);
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0];
    if (!contentType || !['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
      trace.record('image-failed', 'invalid-response', response.status);
      throw new Error('The local image response had an invalid content type.');
    }
    const source = await blobDataUrl(await response.blob());
    return trimPadding ? trimTransparentPadding(source) : source;
  });
}

async function catalogRasterUrl(path: string, trimPadding = false): Promise<string> {
  return cachedRasterUrl(catalogRasterUrls, path, trimPadding);
}

window.addEventListener('pagehide', () => invalidateCatalogRasterCache(), { once: true });

function reportRendererDiagnostic(event: DiagnosticEvent): void {
  recordDiagnostic(event, { area: event.startsWith('stream-save:') ? 'stream' : 'app' });
}

export async function websocketUrl(): Promise<string> {
  const apiBase = await apiBasePromise;
  const url = new URL(apiBase);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  return url.toString();
}

// OBS may embed an older browser without AbortSignal.timeout.
async function stingerRequest(path: string, init?: RequestInit, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new DOMException('', 'TimeoutError')), timeoutMs);
  try {
    return await request(path, { ...init, signal: controller.signal }, { decoder: stingerStateSchema });
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  scoreboardPhotoSettings: () => request('/api/scoreboard-photos', undefined, { decoder: scoreboardPhotoSettingsSchema }),
  updateScoreboardPhotoSettings: (settings: ScoreboardPhotoSettings) => request('/api/scoreboard-photos', { method: 'PUT', body: JSON.stringify(settings) }, { decoder: scoreboardPhotoSettingsSchema }),
  resolveScoreboardPhotos: (players: ScoreboardPhotoIdentity[]) => request('/api/scoreboard-photos/resolve', { method: 'POST', body: JSON.stringify({ players }) }, { decoder: resolvedScoreboardPhotosSchema, trackPendingWrite: false }),
  playerHeadshotAssetUrl: (id: string) => catalogRasterUrl(`/assets/player-headshots/${encodeURIComponent(id)}`),
  stingers: () => stingerRequest('/api/broadcast/stingers'),
  updateStingers: (settings: StingerSettings) => request('/api/broadcast/stingers', { method: 'PUT', body: JSON.stringify(settings) }, { decoder: stingerStateSchema }),
  importStinger: (kind: StingerKind, file: File) => request(`/api/broadcast/stingers/video/${kind}?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file }, { decoder: stingerStateSchema }),
  removeStinger: (kind: StingerKind) => request(`/api/broadcast/stingers/video/${kind}`, { method: 'DELETE' }, { decoder: stingerStateSchema }),
  playStinger: (kind: StingerKind) => request('/api/broadcast/stingers/play', { method: 'POST', body: JSON.stringify({ kind }) }, { decoder: stingerStateSchema }),
  stopStinger: () => request('/api/broadcast/stingers/stop', { method: 'POST' }, { decoder: stingerStateSchema }),
  reconnectStingers: () => stingerRequest('/api/broadcast/stingers/reconnect', { method: 'POST' }),
  stingerSource: (clientId: string, active: boolean, program: boolean) => stingerRequest('/api/broadcast/stingers/source', { method: 'POST', body: JSON.stringify({ clientId, active, program }) }, 2000),
  claimStinger: (clientId: string, cueId: string) => request('/api/broadcast/stingers/claim', { method: 'POST', body: JSON.stringify({ clientId, cueId }) }, { decoder: stingerClaimSchema }),
  finishStinger: (clientId: string, cueId: string, error?: string) => request('/api/broadcast/stingers/finish', { method: 'POST', body: JSON.stringify({ clientId, cueId, error }) }, { decoder: stingerStateSchema }),
  stingerVideoUrl: async (id: string) => `${await apiBasePromise}/assets/stingers/${encodeURIComponent(id)}`,
  lookupLibraryPlayer: (reference: string) => request('/api/players/lookup', { method: 'POST', body: JSON.stringify({ reference }) }, { decoder: libraryLookupSchema }),
  importPlayerLibrary: (players: LibraryPlayer[]) => request('/api/players/import', { method: 'POST', body: JSON.stringify(players) }, { decoder: libraryImportSchema }),
  searchPlayers: (q = '', offset = 0) => request(`/api/players?q=${encodeURIComponent(q)}&offset=${offset}`, undefined, { decoder: librarySearchSchema }),
  libraryPlayer: (id: string) => request(`/api/players/${encodeURIComponent(id)}`, undefined, { decoder: libraryPlayerSchema }),
  saveLibraryPlayer: (player: LibraryPlayer) => request('/api/players', { method: 'POST', body: JSON.stringify(player) }, { decoder: librarySaveSchema }),
  deleteLibraryPlayer: (player: LibraryPlayer) => request(`/api/players/${player.localId}`, { method: 'DELETE', body: JSON.stringify({ updatedAt: player.updatedAt }) }),
  resolvePlayers: (players: LibraryIdentity[], gameKey: string) => request('/api/players/resolve', { method: 'POST', body: JSON.stringify({ players, gameKey }) }, { decoder: libraryResolveSchema }),
  importEventPlayers: (eventId: string, page: number) => request('/api/players/import-event', { method: 'POST', body: JSON.stringify({ eventId, page }) }, { decoder: playerImportPageSchema }),
  health: async () => {
    const health = await request<AppHealth>('/api/health');
    return { ...health, recoveryNotices: health.recoveryNotices.map((notice) => localizedNativeError(notice)) };
  },
  gameProfiles: (): Promise<{ profiles: GameProfile[] }> =>
    Promise.resolve({ profiles: Object.values(gameProfileCatalog) }),
  logos: () => request<{ logos: LogoAsset[] }>('/api/assets/logos'),
  playerStats: (player: StatsPlayer) => request(`/api/broadcast/player-stats?player=${player}`, undefined, { decoder: playerStatsSchema }),
  playerStatsSettings: () => request('/api/broadcast/player-stats/settings', undefined, { decoder: playerStatsSettingsSchema }),
  updatePlayerStatsSettings: (settings: PlayerStatsSettings) => request('/api/broadcast/player-stats/settings', { method: 'PUT', body: JSON.stringify(settings) }, { decoder: playerStatsSettingsSchema }),
  statsTournamentLogoAssetUrl: (id: string) => catalogRasterUrl(`/assets/startgg-tournament-logos/${encodeURIComponent(id)}`, true),
  appearancePreferences: () => request('/api/settings/appearance', undefined, { decoder: appearancePreferencesSchema }),
  updateAppearancePreferences: (settings: AppearancePreferences) => request('/api/settings/appearance', { method: 'PUT', body: JSON.stringify(settings) }, { decoder: appearancePreferencesSchema }),
  bracketScreenState: () => request('/api/broadcast/bracket-screen', undefined, { decoder: bracketScreenStateSchema }),
  updateBracketScreenSettings: (settings: BracketSettings) => request('/api/broadcast/bracket-screen', { method: 'PUT', body: JSON.stringify(settings) }, { decoder: bracketScreenStateSchema }),
  refreshBracketScreen: () => request('/api/broadcast/bracket-screen/refresh', { method: 'POST' }, { decoder: bracketScreenStateSchema }),
  reloadAssets: async () => {
    const result = await request('/api/assets/reload', { method: 'POST' }, { decoder: assetCatalogRevisionSchema });
    applyCatalogRevision(result.revision);
    requestGameFolderCheck();
  },
  checkAssets: async (signal?: AbortSignal) => {
    const result = await request('/api/assets/check', { method: 'POST', signal }, { decoder: assetCatalogCheckSchema, trackPendingWrite: false });
    if (result.changed || (nativeCatalogRevision !== undefined && nativeCatalogRevision !== result.revision)) {
      applyCatalogRevision(result.revision);
    } else nativeCatalogRevision ??= result.revision;
  },
  commentatorState: () => request<CommentatorState>(
    '/api/broadcast/commentators', undefined, { decoder: commentatorStateSchema }
  ),
  updateCommentatorState: (state: CommentatorState) =>
    request<CommentatorState>('/api/broadcast/commentators', {
      method: 'PUT',
      body: JSON.stringify(state)
    }, { decoder: commentatorStateSchema }),
  resultScreenState: () => request<ResultScreenState>(
    '/api/broadcast/result-screen', undefined, { decoder: resultScreenStateSchema }
  ),
  updateResultScreenState: (state: ResultScreenState) =>
    request<ResultScreenState>('/api/broadcast/result-screen', {
      method: 'PUT',
      body: JSON.stringify(state)
    }, { decoder: resultScreenStateSchema }),
  versusScreenState: () => request<VersusScreenState>(
    '/api/broadcast/versus-screen', undefined, { decoder: versusScreenStateSchema }
  ),
  updateVersusScreenState: (state: VersusScreenState) =>
    request<VersusScreenState>('/api/broadcast/versus-screen', {
      method: 'PUT',
      body: JSON.stringify(state)
    }, { decoder: versusScreenStateSchema }),
  topEightMatchupsState: () => request<TopEightMatchupsState>(
    '/api/broadcast/top-eight-matchups', undefined, { decoder: topEightMatchupsStateSchema }
  ),
  updateTopEightMatchupsState: (state: TopEightMatchupsState) =>
    request<TopEightMatchupsState>('/api/broadcast/top-eight-matchups', {
      method: 'PUT',
      body: JSON.stringify(state)
    }, { decoder: topEightMatchupsStateSchema }),
  refreshVersusHistory: () => request<VersusScreenState>('/api/broadcast/versus-screen/history', {
    method: 'POST'
  }, { decoder: versusScreenStateSchema }),
  logoAssetUrl: (assetId: string) =>
    catalogRasterUrl(`/assets/tournament-logos/${encodeURIComponent(assetId)}`, true),
  assetCatalogSummary: (gameId: string) =>
    request<AssetCatalogSummary>(
      `/api/assets/catalog-summary?gameId=${encodeURIComponent(gameId)}`
    ),
  playerMedia: () => request<OverlayMediaMatches>('/api/assets/player-media'),
  identityMedia: (
    identities: IdentityMediaInput[],
    context?: { tournamentName?: string; headline?: string }
  ) =>
    request<{ matches: OverlayMediaMatches['playerOne'][] }>('/api/assets/identity-media', {
      method: 'POST',
      body: JSON.stringify({ identities, ...context })
    }, { trackPendingWrite: false }),
  sponsorLogoAssetUrl: (assetId: string) =>
    catalogRasterUrl(`/assets/sponsor-logos/${encodeURIComponent(assetId)}`, true),
  playerPhotoAssetUrl: (assetId: string) =>
    catalogRasterUrl(`/assets/player-photos/${encodeURIComponent(assetId)}`),
  gameCharacterAssets: (gameId: string) =>
    request<{ assets: GameCharacterAsset[] }>(
      `/api/assets/game-characters?gameId=${encodeURIComponent(gameId)}`
    ),
  gameCharacterAssetUrl: (gameId: string, assetId: string) =>
    catalogRasterUrl(
      `/assets/game-characters/${encodeURIComponent(gameId)}/${encodeURIComponent(assetId)}`
    ),
  gameCharacterPortraitUrl: (gameId: string, assetId: string) =>
    catalogRasterUrl(
      `/assets/game-character-portraits/${encodeURIComponent(gameId)}/${encodeURIComponent(assetId)}`
    ),
  customScoreboards: () => request(
    '/api/custom-scoreboards', undefined, { decoder: customScoreboardListSchema }
  ),
  importCustomScoreboard: (name: string, file: File) => request<CustomScoreboard>(
    `/api/custom-scoreboards/import?name=${encodeURIComponent(name)}`,
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: file },
    { decoder: customScoreboardSchema }
  ),
  updateCustomScoreboard: (scoreboard: CustomScoreboard) => request<CustomScoreboard>(
    `/api/custom-scoreboards/${encodeURIComponent(scoreboard.id)}`,
    { method: 'PUT', body: JSON.stringify(scoreboard) },
    { decoder: customScoreboardSchema }
  ),
  deleteCustomScoreboard: (scoreboardId: string) => request<{ deleted: true }>(
    `/api/custom-scoreboards/${encodeURIComponent(scoreboardId)}`,
    { method: 'DELETE' }
  ),
  customScoreboardFrameUrl: (scoreboard: Pick<CustomScoreboard, 'id'>) =>
    cachedRasterUrl(
      customScoreboardFrameUrls,
      `/assets/custom-scoreboards/${encodeURIComponent(scoreboard.id)}/frame`
    ),
  countries: () => request<{ countries: CountryOption[] }>('/api/locations/countries'),
  states: (country: string) =>
    request<{ states: StateOption[] }>(`/api/locations/states?country=${encodeURIComponent(country)}`),
  tokenStatus: (): Promise<TokenStatus> => getNativeTokenStatus(),
  setToken: (token: string) => setNativeStartggToken(token, false),
  setSessionToken: (token: string) => setNativeStartggToken(token, true),
  clearToken: () => clearNativeStartggToken(),
  copyLocalUrl: async (kind: LocalHandoffUrl) => {
    const apiBase = await apiBasePromise;
    await copyOverlayUrl(apiBase, kind);
  },
  prepareGameCharacters: (assetCatalogSlug: string, videogameId?: string) => {
    const key = JSON.stringify([assetCatalogSlug, videogameId]);
    const existing = gamePreparationRequests.get(key);
    if (existing) return existing;
    // Share concurrent setup across panels, but check the files again on later visits.
    const pending = request(
      '/api/assets/game-characters/prepare',
      { method: 'POST', body: JSON.stringify({ gameId: assetCatalogSlug, videogameId }) },
      { decoder: gameCharacterPreparationSchema }
    ).then((result) => {
      if (result.created > 0) invalidateCatalogRasterCache({ recheckGameFolders: false });
      return result;
    }).finally(() => {
      if (gamePreparationRequests.get(key) === pending) gamePreparationRequests.delete(key);
    });
    gamePreparationRequests.set(key, pending);
    return pending;
  },
  videogames: () => request('/api/startgg/videogames', undefined, { decoder: startggVideogamesSchema }),
  recentTournaments: () =>
    request<{ tournaments: RecentTournament[] }>('/api/startgg/recent-tournaments'),
  clearStartggCache: async () => {
    const result = await request<{ cleared: true }>('/api/startgg/cache', { method: 'DELETE' });
    gamePreparationRequests.clear();
    invalidateCatalogRasterCache();
    return result;
  },
  events: (tournamentSlug: string) =>
    request<StartggEventsResult>(`/api/startgg/events?tournamentSlug=${encodeURIComponent(tournamentSlug)}`),
  eventStandings: (eventId: string) => {
    const query = new URLSearchParams({ eventId });
    return request<StartggEventStandingsResult>(
      `/api/startgg/event-standings?${query.toString()}`, { method: 'POST' }
    );
  },
  eventStandingsBySlug: (eventSlug: string) => {
    const query = new URLSearchParams({ eventSlug });
    return request<StartggEventStandingsResult>(
      `/api/startgg/event-standings?${query.toString()}`, { method: 'POST' }
    );
  },
  streamQueue: (tournamentSlug: string) =>
    request<StartggStreamQueueResult>(`/api/startgg/stream-queue?tournamentSlug=${encodeURIComponent(tournamentSlug)}`),
  phases: (eventId: string) =>
    request<StartggPhasesResult>(`/api/startgg/phases?eventId=${encodeURIComponent(eventId)}`),
  phaseGroups: (phaseId: string, page = 1, perPage = 50) => {
    const query = new URLSearchParams({
      phaseId,
      page: String(page),
      perPage: String(perPage)
    });
    return request<StartggPhaseGroupsResult>(`/api/startgg/phase-groups?${query.toString()}`);
  },
  sets: (scope: StartggSetScope, page = 1, perPage = 25) => {
    const query = new URLSearchParams({
      scope: scope.type,
      eventId: scope.eventId,
      page: String(page),
      perPage: String(perPage)
    });

    if (scope.type === 'phase') {
      query.set('phaseId', scope.phaseId);
    } else if (scope.type === 'phaseGroup') {
      query.set('phaseGroupId', scope.phaseGroupId);
    } else if (scope.type === 'station') {
      query.set('stationNumber', String(scope.stationNumber));
    }

    return request<StartggSetsResult>(`/api/startgg/sets?${query.toString()}`);
  },
  selectStartggSet: (
    setId: string,
    gameId: string,
    context: {
      eventId?: string;
      tournamentSlug?: string;
      assetCatalogSlug?: string;
      restoreOverrides?: boolean;
      preserveBroadcast?: boolean;
      preserveStation?: boolean;
      preserveMatchLength?: boolean;
    } = {}
  ) =>
    request<StartggSelectionResult>('/api/startgg/select-set', {
      method: 'POST',
      body: JSON.stringify({ setId, gameId, ...context })
    }),
  inspectStartggSet: (
    setId: string,
    gameId: string,
    context: { eventId?: string; tournamentSlug?: string; assetCatalogSlug?: string } = {}
  ) =>
    request<StartggSetInspectionResult>('/api/startgg/inspect-set', {
      method: 'POST',
      body: JSON.stringify({ setId, gameId, ...context })
    }),
  reportStartggSet: (input: {
    outcome?: ReportOutcome;
    setId: string;
    winnerId: string;
    updatedAt: string;
    confirmed: true;
  }) =>
    request<StartggReportResult>('/api/startgg/report-set', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  quickReportStartggSet: (input: StartggQuickReportInput) =>
    request<StartggQuickReportResult>('/api/startgg/quick-report-set', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  state: () => request<OverlayState>('/api/state', undefined, { decoder: overlayStateSchema }),
  updateSelectedSet: (selectedSet: SelectedSetState) =>
    request<OverlayState>('/api/state/selected-set', {
      method: 'PUT',
      body: JSON.stringify(selectedSet)
    }, { retryNetworkFailure: true, decoder: overlayStateSchema }),
  selectExhibitionGame: (selection: ExhibitionGameSelection) => request<OverlayState>(
    '/api/state/exhibition-game',
    { method: 'POST', body: JSON.stringify(selection) },
    { decoder: overlayStateSchema }
  ),
  clearSelectedSet: () =>
    request<OverlayState>('/api/state/selected-set', {
      method: 'DELETE'
    }, { retryNetworkFailure: true, decoder: overlayStateSchema }),
  clearPlayerDetails: (updatedAt: string) => request<OverlayState>(
    '/api/state/players/clear',
    { method: 'POST', body: JSON.stringify({ updatedAt }) },
    { decoder: overlayStateSchema }
  ),
  validateModerationText: (field: string, value: string) =>
    request<{ safe: true }>('/api/moderation/text', {
      method: 'POST',
      body: JSON.stringify({ field, value })
    }),
  setScore: (side: 'one' | 'two', score: number) =>
    request<OverlayState>('/api/state/score', {
      method: 'POST',
      body: JSON.stringify({ side, score })
    }, { decoder: overlayStateSchema }),
  resetScores: () =>
    request<OverlayState>('/api/state/scores/reset', {
      method: 'POST'
    }, { decoder: overlayStateSchema }),
  swapPlayers: () =>
    request<OverlayState>('/api/state/players/swap', {
      method: 'POST'
    }, { decoder: overlayStateSchema }),
  reportRendererDiagnostic
};
