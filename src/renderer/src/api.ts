import type {
  AppHealth,
  AssetCatalogSummary,
  CountryOption,
  GameCharacterAsset,
  IdentityMediaInput,
  LogoAsset,
  OverlayMediaMatches,
  OverlayState,
  RecentTournament,
  SelectedSetState,
  StartggErrorCode,
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
import { decodeResponse, type ResponseDecoder } from './responseDecoder';
import { i18n } from './i18n';
import { localizedStartggError } from './i18n/startggErrors';
import {
  clearNativeStartggToken,
  copyActiveOverlayUrl,
  getDesktopApiPort,
  getNativeTokenStatus,
  isTauriRuntime,
  reportNativeRendererDiagnostic,
  type RendererDiagnosticEvent,
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
const catalogRasterUrls = new BoundedPromiseCache<string>(96);
const customScoreboardFrameUrls = new BoundedPromiseCache<string>(4);

export function invalidateCatalogRasterCache(): void {
  catalogRasterUrls.clear();
  customScoreboardFrameUrls.clear();
}

async function cachedRasterUrl(cache: BoundedPromiseCache<string>, path: string): Promise<string> {
  return cache.getOrCreate(path, async () => {
    const apiBase = await apiBasePromise;
    const response = await fetch(`${apiBase}${path}`);
    if (!response.ok) {
      throw new Error(`Local image request failed (${response.status}).`);
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0];
    if (!contentType || !['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
      throw new Error('The local image response had an invalid content type.');
    }
    return blobDataUrl(await response.blob());
  });
}

async function catalogRasterUrl(path: string): Promise<string> {
  return cachedRasterUrl(catalogRasterUrls, path);
}

window.addEventListener('pagehide', invalidateCatalogRasterCache, { once: true });

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The local image could not be prepared for display.'));
    reader.readAsDataURL(blob);
  });
}

type RequestOptions<T> = {
  retryNetworkFailure?: boolean;
  decoder?: ResponseDecoder<T>;
};

export class LocalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'LocalApiError';
  }
}

function reportRendererDiagnostic(event: RendererDiagnosticEvent): void {
  if (isTauriRuntime()) {
    void reportNativeRendererDiagnostic(event).catch(() => undefined);
  }
}

async function request<T>(path: string, init?: RequestInit, options: RequestOptions<T> = {}): Promise<T> {
  const apiBase = await apiBasePromise;
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...withJsonBodyHeaders(init)
    });
  } catch {
    if (options.retryNetworkFailure) {
      reportRendererDiagnostic('local-request:retry');
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      try {
        response = await fetch(`${apiBase}${path}`, {
          ...withJsonBodyHeaders(init)
        });
      } catch {
        reportRendererDiagnostic('local-request:failed');
        throw new Error(i18n.t('errors:localServiceAfterRetry', { url: apiBase }));
      }
    } else {
      reportRendererDiagnostic('local-request:failed');
      throw new Error(i18n.t('errors:localService', { url: apiBase }));
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as {
      error?: string;
      code?: StartggErrorCode;
    } | undefined;
    throw new LocalApiError(localizedResponseError(payload, response.status), response.status, payload?.code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return decodeResponse(await response.json(), options.decoder, path);
}

function localizedResponseError(
  payload: { error?: string; code?: StartggErrorCode } | undefined,
  status: number
): string {
  return localizedStartggError(payload, i18n.t('errors:http', { status }));
}

export async function websocketUrl(): Promise<string> {
  const apiBase = await apiBasePromise;
  const url = new URL(apiBase);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  return url.toString();
}

export const api = {
  health: () => request<AppHealth>('/api/health'),
  gameProfiles: (): Promise<{ profiles: GameProfile[] }> =>
    Promise.resolve({ profiles: Object.values(gameProfileCatalog) }),
  logos: () => request<{ logos: LogoAsset[] }>('/api/assets/logos'),
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
    catalogRasterUrl(`/assets/tournament-logos/${encodeURIComponent(assetId)}`),
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
    }),
  sponsorLogoAssetUrl: (assetId: string) =>
    catalogRasterUrl(`/assets/sponsor-logos/${encodeURIComponent(assetId)}`),
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
  copyLocalUrl: async () => {
    const apiBase = await apiBasePromise;
    await copyActiveOverlayUrl(apiBase);
  },
  recentTournaments: () =>
    request<{ tournaments: RecentTournament[] }>('/api/startgg/recent-tournaments'),
  clearStartggCache: () =>
    request<{ cleared: true }>('/api/startgg/cache', { method: 'DELETE' }),
  events: (tournamentSlug: string) =>
    request<StartggEventsResult>(`/api/startgg/events?tournamentSlug=${encodeURIComponent(tournamentSlug)}`),
  eventStandings: (eventId: string) => {
    const query = new URLSearchParams({ eventId });
    return request<StartggEventStandingsResult>(
      `/api/startgg/event-standings?${query.toString()}`
    );
  },
  eventStandingsBySlug: (eventSlug: string) => {
    const query = new URLSearchParams({ eventSlug });
    return request<StartggEventStandingsResult>(
      `/api/startgg/event-standings?${query.toString()}`
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
  clearSelectedSet: () =>
    request<OverlayState>('/api/state/selected-set', {
      method: 'DELETE'
    }, { retryNetworkFailure: true, decoder: overlayStateSchema }),
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
