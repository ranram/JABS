import type { GameId } from './gameProfiles';

export type PlayerSide = 'one' | 'two';

export type PlayerState = {
  entrantId: string;
  playerId?: string;
  name: string;
  prefix?: string;
  sponsor?: string;
  xHandle?: string;
  /** Ordered team roster. `character` remains the backwards-compatible lead slot. */
  characters?: string[];
  character?: string;
  /** Exact local artwork chosen for the lead character. Never sent to start.gg. */
  characterAssetId?: string;
  country?: string;
  /** Optional presentation override. The player's actual country remains unchanged. */
  displayFlag?: string;
  state?: string;
  pronouns?: string;
  seed?: number;
  score: number;
};

export type CountryOption = {
  code: string;
  name: string;
  emoji: string;
};

export type StateOption = {
  code: string;
  name: string;
};

export type LogoAsset = {
  id: string;
  label: string;
};

export type AssetCatalogCounts = {
  characterArt: number;
  characterPortraits: number;
  tournamentLogos: number;
  sponsorLogos: number;
  playerPhotos: number;
};

export type AssetCatalogSummary = {
  logos: LogoAsset[];
  counts: AssetCatalogCounts;
};

export type PlayerMediaMatch = {
  sponsorLogoAssetId?: string;
  playerPhotoAssetId?: string;
};

export type IdentityMediaInput = {
  name: string;
  prefix?: string;
  sponsor?: string;
};

export type OverlayMediaMatches = {
  playerOne: PlayerMediaMatch;
  playerTwo: PlayerMediaMatch;
};

export type GameCharacterAsset = {
  character: string;
  /** Full-subject artwork. Portrait-only catalog entries intentionally omit it. */
  assetId?: string;
  /** Optional square face/bust crop from game-assets/<slug>/portraits/. */
  portraitAssetId?: string;
  variants: GameCharacterAssetVariant[];
};

export type GameCharacterAssetVariant = {
  /** Number parsed from the filename, or "Default" for an unnumbered file. */
  label: string;
  assetId?: string;
  portraitAssetId?: string;
};

export type BroadcastPresentation = {
  infoBarEnabled: boolean;
  infoLeft?: string;
  infoRight?: string;
  logoEnabled: boolean;
  logoAssetId?: string;
};

export type SetGameCharacterSelection = {
  entrantId: string;
  character: string;
};

export type SetGameResult = {
  winnerId: string;
  selections?: SetGameCharacterSelection[];
};

export type SelectedSetState = {
  setId?: string;
  eventId?: string;
  tournamentSlug?: string;
  displayName: string;
  phase?: string;
  phaseGroup?: string;
  round?: string;
  winnersSideEntrantId?: string;
  station?: string;
  state?: string;
  gameId: GameId;
  gameName?: string;
  stylingGameId?: GameId;
  /** Game-agnostic scoreboard artwork and layout selected from the native catalog. */
  customScoreboardId?: string;
  customScoreboardRevision?: string;
  assetCatalogSlug?: string;
  matchFormat?: 'best-of' | 'first-to';
  bestOf: number;
  broadcast?: BroadcastPresentation;
  gameHistory?: SetGameResult[];
  playerOne: PlayerState;
  playerTwo: PlayerState;
  updatedAt: string;
};

export type OverlayState = {
  selectedSet: SelectedSetState;
};

export type SetSummary = {
  id: string;
  roundNumber?: number;
  displayScore?: string;
  entrantOneScore?: number;
  entrantTwoScore?: number;
  phase?: string;
  phaseOrder?: number;
  phaseGroup?: string;
  phaseGroupId?: string;
  round?: string;
  state?: string;
  station?: string;
  entrantOne?: {
    id: string;
    name: string;
    sponsor?: string;
  };
  entrantTwo?: {
    id: string;
    name: string;
    sponsor?: string;
  };
  prerequisites?: Array<{
    setId: string;
    placement: number;
  }>;
};

export type StartggPageInfo = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type StartggPhase = {
  id: string;
  name: string;
};

export type StartggPhaseGroup = {
  id: string;
  displayIdentifier: string;
};

export type StartggSetScope =
  | {
      type: 'event';
      eventId: string;
    }
  | {
      type: 'phase';
      eventId: string;
      phaseId: string;
    }
  | {
      type: 'phaseGroup';
      eventId: string;
      phaseGroupId: string;
    }
  | {
      type: 'station';
      eventId: string;
      stationNumber: number;
    };

export type StartggSetPage = {
  sets: SetSummary[];
  pageInfo: StartggPageInfo;
};

export type StartggPhaseGroupPage = {
  phaseGroups: StartggPhaseGroup[];
  pageInfo: StartggPageInfo;
};

export type TokenStatus = {
  configured: boolean;
  storageAvailable: boolean;
  sessionOnly: boolean;
};

export type AppHealth = {
  ok: boolean;
  port: number;
  token: TokenStatus;
};

export type StartggEvent = {
  id: string;
  name: string;
  videogame?: {
    id: string;
    name: string;
  };
};

export type RecentTournament = {
  slug: string;
  openedAt: string;
};

export type StartggStreamAssignment = {
  setId: string;
  streamName: string;
  queuePosition: number;
};

export type StartggSource = 'live' | 'cache';

export type StartggErrorCode =
  | 'token-missing'
  | 'authentication'
  | 'permission'
  | 'rate-limit'
  | 'query-complexity'
  | 'timeout'
  | 'network'
  | 'upstream'
  | 'invalid-response'
  | 'graphql'
  | 'conflict';

export type StartggResultMeta = {
  source: StartggSource;
  cachedAt?: string;
  warning?: string;
};

export type StartggEventsResult = StartggResultMeta & {
  events: StartggEvent[];
};

export type StartggEventStanding = {
  placement: number;
  name: string;
  prefix?: string;
  country?: string;
  xHandle?: string;
  character?: string;
  isFinal: boolean;
};

export type StartggEventStandingsResult = {
  eventName: string;
  eventGameName?: string;
  eventState?: string;
  eventUrl?: string;
  numEntrants?: number;
  standings: StartggEventStanding[];
  finalized: boolean;
};

export type StartggStreamQueueResult = StartggResultMeta & {
  assignments: StartggStreamAssignment[];
};

export type StartggPhasesResult = StartggResultMeta & {
  phases: StartggPhase[];
};

export type StartggPhaseGroupsResult = StartggResultMeta & StartggPhaseGroupPage;

export type StartggSetsResult = StartggResultMeta & StartggSetPage;

export type StartggSelectionResult = StartggResultMeta & {
  state: OverlayState;
};

export type StartggSetInspectionResult = StartggResultMeta & {
  selectedSet: SelectedSetState;
};

export type StartggReportResult = {
  state: OverlayState;
  reportedSetId: string;
  reportedSetState?: string;
  reportedGameCount: number;
  reportedCharacterSelectionCount: number;
};

export type StartggQuickReportResult = {
  reportedSetId: string;
  reportedSetState?: string;
  reportedGameCount: number;
  reportedCharacterSelectionCount: number;
};
