import type { SetStateAction } from 'react';
import type { GameId } from '@shared/gameProfiles';
import type { RecentTournament, StartggSetScope } from '@shared/models';
import type { BracketBrowserState } from './bracketBrowserState';

export type BracketController = {
  state: Readonly<BracketBrowserState & {
    tournamentLoaded: boolean;
    searchCatalogIsCurrent: boolean;
  }>;
  actions: {
    // Editable browser fields.
    setTournamentSlug(value: SetStateAction<string>): void;
    setRecentTournaments(value: SetStateAction<RecentTournament[]>): void;
    setSelectionGameId(value: SetStateAction<GameId | ''>): void;
    setStationNumber(value: SetStateAction<string>): void;
    setSetSearch(value: SetStateAction<string>): void;

    // Full-event searches can take several requests; allow the operator to cancel.
    ensureCompleteSetSearchCatalog(scope?: StartggSetScope, forceRefresh?: boolean): Promise<void>;
    cancelSetSearch(): void;

    // Pause autosave and clear the stream before clearing the bracket selection.
    unloadTournament(): void | Promise<void>;

    // Bracket navigation and cache management.
    clearCachedBracketData(): Promise<void>;
    loadEvents(slug?: string): Promise<void>;
    selectEvent(eventId: string): Promise<void>;
    selectPhase(phaseId: string): Promise<void>;
    loadPhaseGroups(page: number): Promise<void>;
    selectPhaseGroup(phaseGroupId: string): Promise<void>;
    browseStation(): Promise<void>;
    browseAllEventSets(): Promise<void>;
    loadSets(scope?: StartggSetScope, page?: number): Promise<void>;
    loadMoreSets(): Promise<void>;
    refreshAfterReport(): Promise<boolean>;
  };
};
