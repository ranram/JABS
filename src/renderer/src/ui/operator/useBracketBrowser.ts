import { useRef, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { gameIdForStartggVideogame, type GameId } from '@shared/gameProfiles';
import type {
  RecentTournament,
  SetSummary,
  StartggEvent,
  StartggPageInfo,
  StartggPhase,
  StartggPhaseGroup,
  StartggPhaseGroupsResult,
  StartggResultMeta,
  StartggSetScope,
  StartggStreamAssignment
} from '@shared/models';
import { normalizeTournamentSlug } from '@shared/startgg';
import { api } from '../../api';
import { errorMessage, localizedScopeLabel, resultMessage, setScopeKey } from './operatorUtils';
import { useBracketBrowserState } from './bracketBrowserState';

type UseBracketBrowserOptions = {
  setMessage: Dispatch<SetStateAction<string | undefined>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setTokenVerified: Dispatch<SetStateAction<boolean>>;
};

export function useBracketBrowser({
  setMessage,
  setLoading,
  setTokenVerified
}: UseBracketBrowserOptions) {
  const { t } = useTranslation('operator');
  const { state, setField, patch, reset } = useBracketBrowserState();
  const {
    tournamentSlug, recentTournaments, events, selectedEventId, selectionGameId,
    phases, selectedPhaseId, phaseGroups, selectedPhaseGroupId, phaseGroupPageInfo,
    stationNumber, setScope, sets, streamAssignments, setSearch, setSearchCatalog,
    setSearchCatalogKey, setSearchLoading, setSearchProgress, setPageInfo, setPageLoading
  } = state;
  const setTournamentSlug = (value: SetStateAction<string>) => setField('tournamentSlug', value);
  const setRecentTournaments = (value: SetStateAction<RecentTournament[]>) => setField('recentTournaments', value);
  const setEvents = (value: SetStateAction<StartggEvent[]>) => setField('events', value);
  const setSelectedEventId = (value: SetStateAction<string>) => setField('selectedEventId', value);
  const setSelectionGameId = (value: SetStateAction<GameId | ''>) => setField('selectionGameId', value);
  const setPhases = (value: SetStateAction<StartggPhase[]>) => setField('phases', value);
  const setSelectedPhaseId = (value: SetStateAction<string>) => setField('selectedPhaseId', value);
  const setPhaseGroups = (value: SetStateAction<StartggPhaseGroup[]>) => setField('phaseGroups', value);
  const setSelectedPhaseGroupId = (value: SetStateAction<string>) => setField('selectedPhaseGroupId', value);
  const setPhaseGroupPageInfo = (value: SetStateAction<StartggPageInfo | undefined>) => setField('phaseGroupPageInfo', value);
  const setStationNumber = (value: SetStateAction<string>) => setField('stationNumber', value);
  const setSetScope = (value: SetStateAction<StartggSetScope | undefined>) => setField('setScope', value);
  const setSets = (value: SetStateAction<SetSummary[]>) => setField('sets', value);
  const setStreamAssignments = (value: SetStateAction<StartggStreamAssignment[]>) => setField('streamAssignments', value);
  const setSetSearch = (value: SetStateAction<string>) => setField('setSearch', value);
  const setSetSearchCatalog = (value: SetStateAction<SetSummary[] | undefined>) => setField('setSearchCatalog', value);
  const setSetSearchCatalogKey = (value: SetStateAction<string | undefined>) => setField('setSearchCatalogKey', value);
  const setSetSearchLoading = (value: SetStateAction<boolean>) => setField('setSearchLoading', value);
  const setSetSearchProgress = (value: SetStateAction<{ loaded: number; total: number } | undefined>) => setField('setSearchProgress', value);
  const setSetPageInfo = (value: SetStateAction<StartggPageInfo | undefined>) => setField('setPageInfo', value);
  const setSetPageLoading = (value: SetStateAction<boolean>) => setField('setPageLoading', value);
  const setSearchRequestRef = useRef(0);
  const setPageRequestRef = useRef(0);
  const setPageLoadingRef = useRef(false);
  const setScopeRef = useRef<StartggSetScope | undefined>(undefined);
  const setSearchLoadingKeyRef = useRef<string | undefined>(undefined);
  const currentSetScopeKey = setScopeKey(setScope);
  const searchCatalogIsCurrent = setSearchCatalog !== undefined
    && setSearchCatalogKey === currentSetScopeKey;

  async function loadAllPhaseGroups(phaseId: string): Promise<StartggPhaseGroupsResult> {
    const pageSize = 100;
    const first = await api.phaseGroups(phaseId, 1, pageSize);
    recordResult(first);
    const byId = new Map(first.phaseGroups.map((group) => [group.id, group]));
    for (let page = 2; page <= first.pageInfo.totalPages; page += 1) {
      const response = await api.phaseGroups(phaseId, page, pageSize);
      recordResult(response);
      response.phaseGroups.forEach((group) => byId.set(group.id, group));
    }
    const phaseGroups = [...byId.values()];
    return {
      ...first,
      phaseGroups,
      pageInfo: {
        page: 1,
        perPage: Math.max(1, phaseGroups.length),
        total: Math.max(first.pageInfo.total, phaseGroups.length),
        totalPages: phaseGroups.length > 0 ? 1 : 0
      }
    };
  }

  function recordResult(result: StartggResultMeta): void {
    setTokenVerified(result.source === 'live');
  }

  function recordFailure(): void {
    setTokenVerified(false);
  }

  function replaceSetScope(scope: StartggSetScope | undefined): void {
    if (setScopeKey(scope) !== currentSetScopeKey) {
      resetSearchCatalog(true);
      setPageRequestRef.current += 1;
      setPageLoadingRef.current = false;
      setSetPageLoading(false);
    }
    setScopeRef.current = scope;
    setSetScope(scope);
  }

  function resetSearchCatalog(clearSearch = false): void {
    setSearchRequestRef.current += 1;
    setSearchLoadingKeyRef.current = undefined;
    patch({
      ...(clearSearch ? { setSearch: '' } : {}),
      setSearchCatalog: undefined,
      setSearchCatalogKey: undefined,
      setSearchLoading: false,
      setSearchProgress: undefined
    });
  }

  function cancelSetSearch(): void {
    setSearchRequestRef.current += 1;
    setSearchLoadingKeyRef.current = undefined;
    patch({
      setSearchCatalogKey: undefined,
      setSearchLoading: false,
      setSearchProgress: undefined
    });
  }

  async function ensureCompleteSetSearchCatalog(): Promise<void> {
    if (!setScope) return;
    const scope = setScope;
    const scopeKey = setScopeKey(scope)!;
    if (setSearchCatalogKey === scopeKey && setSearchCatalog !== undefined) return;
    if (setSearchLoadingKeyRef.current === scopeKey) return;

    if (setPageInfo && setPageInfo.totalPages <= 1) {
      setSetSearchCatalog(sets);
      setSetSearchCatalogKey(scopeKey);
      return;
    }

    const requestId = setSearchRequestRef.current + 1;
    setSearchRequestRef.current = requestId;
    setSearchLoadingKeyRef.current = scopeKey;
    setSetSearchLoading(true);
    try {
      const firstPage = await api.sets(scope, 1, 20);
      recordResult(firstPage);
      const byId = new Map(firstPage.sets.map((set) => [set.id, set]));
      setSetSearchCatalog([...byId.values()]);
      setSetSearchCatalogKey(scopeKey);
      setSetSearchProgress({ loaded: 1, total: firstPage.pageInfo.totalPages });
      for (let page = 2; page <= firstPage.pageInfo.totalPages; page += 2) {
        if (setSearchRequestRef.current !== requestId) return;
        const pages = [page, page + 1].filter((candidate) => candidate <= firstPage.pageInfo.totalPages);
        const responses = await Promise.all(pages.map((candidate) => api.sets(scope, candidate, 20)));
        for (const response of responses) {
          recordResult(response);
          for (const set of response.sets) byId.set(set.id, set);
        }
        if (setSearchRequestRef.current !== requestId) return;
        setSetSearchProgress({
          loaded: Math.min(page + responses.length - 1, firstPage.pageInfo.totalPages),
          total: firstPage.pageInfo.totalPages
        });
        setSetSearchCatalog([...byId.values()]);
      }
      if (setSearchRequestRef.current !== requestId) return;
      setSetSearchCatalog([...byId.values()]);
      setSetSearchCatalogKey(scopeKey);
    } catch (error) {
      if (setSearchRequestRef.current !== requestId) return;
      recordFailure();
      setMessage(errorMessage(error, t('messages.loadSearch')));
    } finally {
      if (setSearchRequestRef.current === requestId) {
        setSearchLoadingKeyRef.current = undefined;
        setSetSearchLoading(false);
        setSetSearchProgress(undefined);
      }
    }
  }

  async function clearCachedBracketData(): Promise<void> {
    if (!window.confirm(t('messages.clearCacheConfirm'))) return;

    setLoading(true);
    setMessage(undefined);
    try {
      await api.clearStartggCache();
      setSearchRequestRef.current += 1;
      setPageRequestRef.current += 1;
      setSearchLoadingKeyRef.current = undefined;
      setPageLoadingRef.current = false;
      setScopeRef.current = undefined;
      reset();
      recordFailure();
      setMessage(t('messages.cacheCleared'));
    } catch (error) {
      setMessage(errorMessage(error, t('messages.clearCacheFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(slug = tournamentSlug): Promise<void> {
    let normalizedSlug: string;
    try {
      normalizedSlug = normalizeTournamentSlug(slug);
    } catch (error) {
      setMessage(errorMessage(error, t('messages.tournamentRequired')));
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      const response = await api.events(normalizedSlug);
      recordResult(response);
      const firstEventId = response.events[0] ? String(response.events[0].id) : '';
      setTournamentSlug(normalizedSlug);
      setEvents(response.events);
      setSelectedEventId(firstEventId);
      setSelectionGameId(gameIdForStartggVideogame(response.events[0]?.videogame) ?? '');
      setPhases([]);
      setSelectedPhaseId('');
      setPhaseGroups([]);
      setSelectedPhaseGroupId('');
      setPhaseGroupPageInfo(undefined);
      setStationNumber('');
      replaceSetScope(undefined);
      setSets([]);
      setStreamAssignments([]);
      setSetPageInfo(undefined);
      setRecentTournaments((current) => [
        { slug: normalizedSlug, openedAt: new Date().toISOString() },
        ...current.filter((tournament) => tournament.slug !== normalizedSlug)
      ].slice(0, 8));
      const streamQueueRequest = api.streamQueue(normalizedSlug)
        .then((streamQueue) => {
          recordResult(streamQueue);
          setStreamAssignments(streamQueue.assignments);
        })
        .catch(() => setStreamAssignments([]));
      if (firstEventId) {
        await Promise.all([
          streamQueueRequest,
          selectEvent(
            firstEventId,
            response.source === 'cache'
              ? resultMessage(t('messages.cachedEvents', { count: response.events.length }), response)
              : undefined,
            response.events
          )
        ]);
      } else {
        await streamQueueRequest;
        setMessage(resultMessage(t('messages.noEvents'), response));
      }
    } catch (error) {
      recordFailure();
      setMessage(errorMessage(error, t('messages.loadEventsFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function selectEvent(
    eventId: string,
    leadingNotice?: string,
    availableEvents = events
  ): Promise<void> {
    setSelectedEventId(eventId);
    setSelectionGameId(
      gameIdForStartggVideogame(
        availableEvents.find((event) => String(event.id) === eventId)?.videogame
      ) ?? ''
    );
    setSelectedPhaseId('');
    setSelectedPhaseGroupId('');
    setPhases([]);
    setPhaseGroups([]);
    setPhaseGroupPageInfo(undefined);
    setStationNumber('');
    setSets([]);
    setSetSearch('');
    setSetPageInfo(undefined);

    if (!eventId) {
      replaceSetScope(undefined);
      return;
    }

    const scope: StartggSetScope = { type: 'event', eventId };
    replaceSetScope(scope);
    setLoading(true);
    setMessage(undefined);
    try {
      const [phaseResult, setResult] = await Promise.allSettled([
        api.phases(eventId),
        api.sets(scope)
      ]);
      const notices: string[] = leadingNotice ? [leadingNotice] : [];
      if (phaseResult.status === 'fulfilled') {
        recordResult(phaseResult.value);
        setPhases(phaseResult.value.phases);
        notices.push(resultMessage(t('messages.loadedPhases', { count: phaseResult.value.phases.length }), phaseResult.value));
      } else {
        recordFailure();
        notices.push(t('messages.phasesFailed', { message: errorMessage(phaseResult.reason, t('messages.loadPhasesFailed')) }));
      }
      if (setResult.status === 'fulfilled') {
        recordResult(setResult.value);
        setSets(setResult.value.sets);
        setSetPageInfo(setResult.value.pageInfo);
        notices.push(resultMessage(
          t('messages.showingEventSets', { shown: setResult.value.sets.length, total: setResult.value.pageInfo.total }),
          setResult.value
        ));
      } else {
        recordFailure();
        notices.push(t('messages.setsFailed', { message: errorMessage(setResult.reason, t('messages.loadSetsFailed')) }));
      }
      setMessage(notices.join(' '));
    } finally {
      setLoading(false);
    }
  }

  async function selectPhase(phaseId: string): Promise<void> {
    setSelectedPhaseId(phaseId);
    setSelectedPhaseGroupId('');
    setPhaseGroups([]);
    setPhaseGroupPageInfo(undefined);
    setStationNumber('');
    if (!selectedEventId) {
      setMessage(t('messages.selectEvent'));
      return;
    }
    if (!phaseId) {
      await loadSets({ type: 'event', eventId: selectedEventId }, 1);
      return;
    }

    const scope: StartggSetScope = { type: 'phase', eventId: selectedEventId, phaseId };
    replaceSetScope(scope);
    setLoading(true);
    setMessage(undefined);
    try {
      const [groupResult, setResult] = await Promise.allSettled([
        loadAllPhaseGroups(phaseId),
        api.sets(scope)
      ]);
      const notices: string[] = [];
      if (groupResult.status === 'fulfilled') {
        recordResult(groupResult.value);
        setPhaseGroups(groupResult.value.phaseGroups);
        setPhaseGroupPageInfo(groupResult.value.pageInfo);
        notices.push(resultMessage(
          t('messages.loadedPools', { shown: groupResult.value.phaseGroups.length, total: groupResult.value.pageInfo.total }),
          groupResult.value
        ));
      } else {
        recordFailure();
        notices.push(t('messages.poolsFailed', { message: errorMessage(groupResult.reason, t('messages.loadPoolsFailed')) }));
      }
      if (setResult.status === 'fulfilled') {
        recordResult(setResult.value);
        setSets(setResult.value.sets);
        setSetPageInfo(setResult.value.pageInfo);
        notices.push(resultMessage(
          t('messages.showingPhaseSets', { shown: setResult.value.sets.length, total: setResult.value.pageInfo.total }),
          setResult.value
        ));
      } else {
        recordFailure();
        notices.push(t('messages.setsFailed', { message: errorMessage(setResult.reason, t('messages.loadSetsFailed')) }));
      }
      setMessage(notices.join(' '));
    } finally {
      setLoading(false);
    }
  }

  async function loadPhaseGroups(_page: number): Promise<void> {
    if (!selectedPhaseId) return;
    setLoading(true);
    setMessage(undefined);
    try {
      const response = await loadAllPhaseGroups(selectedPhaseId);
      setPhaseGroups(response.phaseGroups);
      setPhaseGroupPageInfo(response.pageInfo);
      setMessage(resultMessage(
        t('messages.loadedPools', { shown: response.phaseGroups.length, total: response.pageInfo.total }),
        response
      ));
    } catch (error) {
      recordFailure();
      setMessage(errorMessage(error, t('messages.loadPoolsFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function selectPhaseGroup(phaseGroupId: string): Promise<void> {
    setSelectedPhaseGroupId(phaseGroupId);
    setStationNumber('');
    if (!selectedEventId || !selectedPhaseId) {
      setMessage(t('messages.selectPhase'));
      return;
    }
    const scope: StartggSetScope = phaseGroupId
      ? { type: 'phaseGroup', eventId: selectedEventId, phaseGroupId }
      : { type: 'phase', eventId: selectedEventId, phaseId: selectedPhaseId };
    await loadSets(scope, 1);
  }

  async function browseStation(): Promise<void> {
    const parsedStationNumber = Number(stationNumber);
    if (!selectedEventId) {
      setMessage(t('messages.selectEvent'));
      return;
    }
    if (!Number.isSafeInteger(parsedStationNumber) || parsedStationNumber < 1) {
      setMessage(t('messages.positiveStation'));
      return;
    }
    setSelectedPhaseId('');
    setSelectedPhaseGroupId('');
    setPhaseGroups([]);
    setPhaseGroupPageInfo(undefined);
    await loadSets({ type: 'station', eventId: selectedEventId, stationNumber: parsedStationNumber }, 1);
  }

  async function browseAllEventSets(): Promise<void> {
    if (!selectedEventId) {
      setMessage(t('messages.selectEvent'));
      return;
    }
    setSelectedPhaseId('');
    setSelectedPhaseGroupId('');
    setPhaseGroups([]);
    setPhaseGroupPageInfo(undefined);
    setStationNumber('');
    await loadSets({ type: 'event', eventId: selectedEventId }, 1);
  }

  async function loadSets(scope = setScope, page = 1): Promise<void> {
    if (!scope) {
      setMessage(t('messages.selectEvent'));
      return;
    }
    replaceSetScope(scope);
    setLoading(true);
    setMessage(undefined);
    try {
      const response = await api.sets(scope, page);
      recordResult(response);
      setSets(response.sets);
      setSetPageInfo(response.pageInfo);
      setMessage(resultMessage(
        t('messages.showingScopeSets', {
          shown: response.sets.length,
          total: response.pageInfo.total,
          scope: localizedScopeLabel(scope)
        }),
        response
      ));
    } catch (error) {
      recordFailure();
      setMessage(errorMessage(error, t('messages.loadSetsFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreSets(): Promise<void> {
    if (!setScope || !setPageInfo || setPageLoadingRef.current || setPageInfo.page >= setPageInfo.totalPages) return;
    const scope = setScope;
    const scopeKey = setScopeKey(scope);
    const nextPage = setPageInfo.page + 1;
    const requestId = setPageRequestRef.current + 1;
    setPageRequestRef.current = requestId;
    setPageLoadingRef.current = true;
    setSetPageLoading(true);
    try {
      const response = await api.sets(scope, nextPage);
      if (setPageRequestRef.current !== requestId || setScopeKey(setScopeRef.current) !== scopeKey) return;
      recordResult(response);
      setSets((current) => {
        const byId = new Map(current.map((set) => [set.id, set]));
        for (const set of response.sets) byId.set(set.id, set);
        return [...byId.values()];
      });
      setSetPageInfo(response.pageInfo);
    } catch (error) {
      if (setPageRequestRef.current !== requestId) return;
      recordFailure();
      setMessage(errorMessage(error, t('messages.loadSetsFailed')));
    } finally {
      if (setPageRequestRef.current === requestId) {
        setPageLoadingRef.current = false;
        setSetPageLoading(false);
      }
    }
  }

  async function refreshAfterReport(): Promise<boolean> {
    if (!setScope) return true;
    try {
      setPageRequestRef.current += 1;
      setPageLoadingRef.current = false;
      setSetPageLoading(false);
      const [response, streamQueue] = await Promise.all([
        api.sets(setScope, 1),
        tournamentSlug ? api.streamQueue(tournamentSlug) : Promise.resolve(undefined)
      ]);
      recordResult(response);
      setSets(response.sets);
      setSetPageInfo(response.pageInfo);
      if (streamQueue) {
        recordResult(streamQueue);
        setStreamAssignments(streamQueue.assignments);
      }
      resetSearchCatalog();
      return true;
    } catch {
      resetSearchCatalog();
      return false;
    }
  }

  return {
    tournamentSlug,
    setTournamentSlug,
    recentTournaments,
    setRecentTournaments,
    events,
    selectedEventId,
    selectionGameId,
    setSelectionGameId,
    phases,
    selectedPhaseId,
    phaseGroups,
    selectedPhaseGroupId,
    phaseGroupPageInfo,
    stationNumber,
    setStationNumber,
    setScope,
    sets,
    streamAssignments,
    setSearch,
    setSetSearch,
    setSearchCatalog,
    setSearchLoading,
    setSearchProgress,
    setPageLoading,
    setPageInfo,
    searchCatalogIsCurrent,
    ensureCompleteSetSearchCatalog,
    cancelSetSearch,
    clearCachedBracketData,
    loadEvents,
    selectEvent,
    selectPhase,
    loadPhaseGroups,
    selectPhaseGroup,
    browseStation,
    browseAllEventSets,
    loadSets,
    loadMoreSets,
    refreshAfterReport
  };
}
