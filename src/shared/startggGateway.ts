import type {
  StartggEventsResult,
  StartggPhaseGroupsResult,
  StartggPhasesResult,
  StartggQuickReportResult,
  StartggSetInspectionResult,
  StartggSetScope,
  StartggSetsResult,
  StartggStreamQueueResult
} from './models';

export type StartggSetContext = {
  eventId?: string;
  tournamentSlug?: string;
  assetCatalogSlug?: string;
};

export type StartggQuickReportInput = {
  setId: string;
  gameId: string;
  bestOf: number;
  expected: {
    state?: string;
    playerOneEntrantId: string;
    playerTwoEntrantId: string;
    playerOneScore: number;
    playerTwoScore: number;
  };
  playerOneScore: number;
  playerTwoScore: number;
  gameHistory?: Array<{
    winnerId: string;
    selections?: Array<{ entrantId: string; character: string }>;
  }>;
  confirmed: true;
};

/**
 * The platform-neutral start.gg operations used by bracket browsing and Quick
 * Score. Desktop implements this interface through its loopback service;
 * mobile implements it with narrow native Tauri commands.
 */
export interface StartggGateway {
  clearStartggCache(): Promise<{ cleared: true }>;
  events(tournamentSlug: string): Promise<StartggEventsResult>;
  streamQueue(tournamentSlug: string): Promise<StartggStreamQueueResult>;
  phases(eventId: string): Promise<StartggPhasesResult>;
  phaseGroups(phaseId: string, page?: number, perPage?: number): Promise<StartggPhaseGroupsResult>;
  sets(scope: StartggSetScope, page?: number, perPage?: number): Promise<StartggSetsResult>;
  inspectStartggSet(
    setId: string,
    gameId: string,
    context?: StartggSetContext
  ): Promise<StartggSetInspectionResult>;
  quickReportStartggSet(input: StartggQuickReportInput): Promise<StartggQuickReportResult>;
}
