import { useCallback, useReducer, type SetStateAction } from 'react';
import type { GameId } from '@shared/gameProfiles';
import type {
  RecentTournament,
  SetSummary,
  StartggEvent,
  StartggPageInfo,
  StartggPhase,
  StartggPhaseGroup,
  StartggSetScope,
  StartggStreamAssignment
} from '@shared/models';

export type BracketBrowserState = {
  tournamentSlug: string;
  recentTournaments: RecentTournament[];
  events: StartggEvent[];
  selectedEventId: string;
  selectionGameId: GameId | '';
  phases: StartggPhase[];
  selectedPhaseId: string;
  phaseGroups: StartggPhaseGroup[];
  selectedPhaseGroupId: string;
  phaseGroupPageInfo?: StartggPageInfo;
  stationNumber: string;
  setScope?: StartggSetScope;
  sets: SetSummary[];
  streamAssignments: StartggStreamAssignment[];
  setSearch: string;
  setSearchCatalog?: SetSummary[];
  setSearchCatalogKey?: string;
  setSearchLoading: boolean;
  setSearchProgress?: { loaded: number; total: number };
  setPageInfo?: StartggPageInfo;
  setPageLoading: boolean;
};

export const initialBracketBrowserState: BracketBrowserState = {
  tournamentSlug: '',
  recentTournaments: [],
  events: [],
  selectedEventId: '',
  selectionGameId: '',
  phases: [],
  selectedPhaseId: '',
  phaseGroups: [],
  selectedPhaseGroupId: '',
  stationNumber: '',
  sets: [],
  streamAssignments: [],
  setSearch: '',
  setSearchLoading: false,
  setPageLoading: false
};

type SetFieldAction = {
  [K in keyof BracketBrowserState]-?: {
    type: 'set';
    key: K;
    value: SetStateAction<BracketBrowserState[K]>;
  }
}[keyof BracketBrowserState];

export type BracketBrowserAction = SetFieldAction | {
  type: 'patch';
  value: Partial<BracketBrowserState>;
} | { type: 'reset' };

export function bracketBrowserReducer(
  state: BracketBrowserState,
  action: BracketBrowserAction
): BracketBrowserState {
  if (action.type === 'reset') return initialBracketBrowserState;
  if (action.type === 'patch') return { ...state, ...action.value };
  const current = state[action.key];
  const value = typeof action.value === 'function'
    ? (action.value as (previous: typeof current) => typeof current)(current)
    : action.value;
  return { ...state, [action.key]: value };
}

export function useBracketBrowserState() {
  const [state, dispatch] = useReducer(bracketBrowserReducer, initialBracketBrowserState);
  const setField = useCallback(<K extends keyof BracketBrowserState>(
    key: K,
    value: SetStateAction<BracketBrowserState[K]>
  ) => {
    dispatch({ type: 'set', key, value } as BracketBrowserAction);
  }, []);
  const patch = useCallback((value: Partial<BracketBrowserState>) => {
    dispatch({ type: 'patch', value });
  }, []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  return { state, setField, patch, reset };
}
