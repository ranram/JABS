import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  gameIdForStartggVideogame,
  type GameId,
  type GameProfile
} from '@shared/gameProfiles';
import { gameAssetCatalogSlug } from '@shared/gameAssetCatalog';
import type {
  CountryOption,
  LogoAsset,
  SelectedSetState,
  SetSummary,
  StartggResultMeta
} from '@shared/models';
import { startggReportReadiness, type StartggReportReadiness } from '@shared/startggReporting';
import { api } from '../api';
import { useOverlayState } from '../hooks/useOverlayState';
import { reconcileDirtyDraft, type OperatorDraftState } from '../operatorDraft';
import { filterLoadedSets } from '../setSearch';
import { TournamentBackdrop } from './ControlDeck';
import { SetActionsModal } from './operator/SetActionsModal';
import { SetSelectorPanel } from './operator/SetSelectorPanel';
import { StreamEditorPanel } from './operator/StreamEditorPanel';
import { LiveControlsPanel } from './operator/LiveControlsPanel';
import { StartggPanel } from './operator/StartggPanel';
import { useBracketBrowser } from './operator/useBracketBrowser';
import { useQuickScoreActions } from './operator/useQuickScoreActions';
import { OperatorTopbar } from './operator/OperatorTopbar';
import { useOperatorNotifications } from './operator/useOperatorNotifications';
import { errorMessage, resultMessage } from './operator/operatorUtils';
import { useStreamDraftAutosave } from './operator/useStreamDraftAutosave';
import { useAssetCatalogReload } from './operator/useAssetCatalogReload';
import type { LocalHandoffUrl } from '../desktopRuntime';
export function OperatorDashboard() {
  const { t } = useTranslation(['operator', 'common', 'errors']);
  const { state, setState, error: stateError } = useOverlayState();
  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [logos, setLogos] = useState<LogoAsset[]>([]);
  const [assetCatalogRevision, setAssetCatalogRevision] = useState(0);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [tokenStorageAvailable, setTokenStorageAvailable] = useState(true);
  const [tokenSessionOnly, setTokenSessionOnly] = useState(false);
  const [tokenVerified, setTokenVerified] = useState(false);
  const [tokenInputReady, setTokenInputReady] = useState(false);
  const [apiPort, setApiPort] = useState<number>();
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [draftState, setDraftState] = useState<OperatorDraftState>();
  const [copiedHandoff, setCopiedHandoff] = useState<LocalHandoffUrl>();
  const browser = useBracketBrowser({ setMessage, setLoading, setTokenVerified });
  const {
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
    refreshAfterReport: refreshSetSelectorAfterReport
  } = browser;

  useEffect(() => {
    void Promise.all([api.gameProfiles(), api.countries(), api.logos(), api.tokenStatus(), api.recentTournaments(), api.health()])
      .then(([profileResponse, countryResponse, logoResponse, tokenStatus, recentResponse, health]) => {
        setProfiles(profileResponse.profiles);
        setCountries(countryResponse.countries);
        setLogos(logoResponse.logos);
        setTokenConfigured(tokenStatus.configured);
        setTokenStorageAvailable(tokenStatus.storageAvailable);
        setTokenSessionOnly(tokenStatus.sessionOnly);
        setRecentTournaments(recentResponse.tournaments);
        setApiPort(health.port);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : t('errors:localSettings'));
      });
  }, []);
  const selectedSet = state?.selectedSet;
  const draft = draftState?.value;
  const draftDirty = draftState?.dirty ?? false;
  const selectedProfile = profiles.find((profile) => profile.id === draft?.gameId);
  const selectedEvent = events.find((event) => String(event.id) === selectedEventId);
  const detectedGameId = gameIdForStartggVideogame(selectedEvent?.videogame);
  const detectedProfile = profiles.find((profile) => profile.id === detectedGameId);
  const setLoadGameId = (detectedGameId ?? selectionGameId) || undefined;
  const assetCatalogSlug = detectedGameId
    ?? gameAssetCatalogSlug(selectedEvent?.videogame)
    ?? draft?.assetCatalogSlug;
  const { reloadAssets, reloadingAssets } = useAssetCatalogReload({
    assetCatalogSlug, setLogos, setAssetCatalogRevision
  });
  const localBaseUrl = apiPort === undefined ? undefined : `http://127.0.0.1:${apiPort}`;
  const { saving: draftSaving, blocked: draftBlocked } = useStreamDraftAutosave({
    draft,
    dirty: draftDirty,
    assetCatalogSlug,
    setOverlayState: setState,
    setDraftState,
    setMessage,
    failureMessage: t('operator:messages.saveStreamFailed')
  });
  const deferredSetSearch = useDeferredValue(setSearch);
  const visibleSets = useMemo(
    () => filterLoadedSets(
      deferredSetSearch.trim() && searchCatalogIsCurrent ? (setSearchCatalog ?? sets) : sets,
      deferredSetSearch
    ),
    [deferredSetSearch, searchCatalogIsCurrent, setSearchCatalog, sets]
  );
  const reportReadiness = selectedSet
    ? startggReportReadiness(selectedSet)
    : { ready: false as const, reason: 'Load a start.gg set before reporting a result.', reasonCode: 'set-missing' as const };

  function localizedReadinessReason(readiness: StartggReportReadiness): string {
    if (readiness.ready) return '';
    switch (readiness.reasonCode) {
      case 'already-complete':
        return t('operator:readiness.alreadyComplete');
      case 'set-missing':
        return t('operator:readiness.setMissing');
      case 'entrants-missing':
        return t('operator:readiness.entrantsMissing');
      case 'score-incomplete':
        return t('operator:readiness.scoreIncomplete', {
          bestOf: readiness.bestOf ?? '',
          target: readiness.target ?? ''
        });
      case 'history-mismatch':
        return t('operator:readiness.historyMismatch');
    }
  }

  const quickScore = useQuickScoreActions({
    setLoadGameId,
    selectedEventId,
    tournamentSlug,
    setMessage,
    setTokenVerified,
    refreshAfterReport: refreshSetSelectorAfterReport,
    readinessReason: localizedReadinessReason
  });
  const openSetRef = useRef(quickScore.open);
  const completeSearchRef = useRef(ensureCompleteSetSearchCatalog);
  const loadMoreSetsRef = useRef(loadMoreSets);
  openSetRef.current = quickScore.open;
  completeSearchRef.current = ensureCompleteSetSearchCatalog;
  loadMoreSetsRef.current = loadMoreSets;
  const openSetFromSelector = useCallback((set: SetSummary) => openSetRef.current(set), []);
  const focusSetSearch = useCallback(() => {
    if (setSearch.trim()) void completeSearchRef.current();
  }, [setSearch]);
  const changeSetSearch = useCallback((nextSearch: string) => {
    setSetSearch(nextSearch);
    if (nextSearch.trim()) void completeSearchRef.current();
  }, [setSetSearch]);
  const loadMoreSetsFromSelector = useCallback(() => {
    void loadMoreSetsRef.current();
  }, []);
  useOperatorNotifications(message, stateError);

  function recordStartggResult(result: StartggResultMeta): void {
    setTokenVerified(result.source === 'live');
  }

  function recordStartggFailure(): void {
    setTokenVerified(false);
  }

  useEffect(() => {
    if (!selectedSet) {
      return;
    }

    setDraftState((current) => {
      if (current?.dirty && current.value.setId === selectedSet.setId) {
        return {
          value: reconcileDirtyDraft(current.value, current.baseline, selectedSet),
          baseline: selectedSet,
          dirty: true
        };
      }

      return {
        value: selectedSet,
        baseline: selectedSet,
        dirty: false
      };
    });
  }, [selectedSet]);

  async function saveToken() {
    const token = tokenInputRef.current?.value.trim() ?? '';
    if (!token) {
      setMessage(t('operator:messages.enterToken'));
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      const status = tokenStorageAvailable
        ? await api.setToken(token)
        : await api.setSessionToken(token);
      if (tokenInputRef.current) {
        tokenInputRef.current.value = '';
      }
      setTokenInputReady(false);
      setTokenConfigured(status.configured);
      setTokenStorageAvailable(status.storageAvailable);
      setTokenSessionOnly(status.sessionOnly);
      setTokenVerified(false);
      setMessage(
        status.sessionOnly
          ? t('operator:messages.sessionTokenSaved')
          : t('operator:messages.tokenSaved')
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('operator:messages.saveTokenFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function removeToken() {
    setLoading(true);
    setMessage(undefined);
    try {
      const status = await api.clearToken();
      setTokenConfigured(status.configured);
      setTokenStorageAvailable(status.storageAvailable);
      setTokenSessionOnly(status.sessionOnly);
      setTokenVerified(false);
      setMessage(t('operator:messages.tokenRemoved'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('operator:messages.removeTokenFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function selectSet(setId: string) {
    if (!selectedSet) {
      return;
    }
    if (!setLoadGameId) {
      setMessage('Choose a game profile before loading a set from this unrecognized event.');
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      const response = await api.selectStartggSet(setId, setLoadGameId, {
        eventId: selectedEventId || undefined,
        tournamentSlug: tournamentSlug || undefined,
        assetCatalogSlug
      });
      recordStartggResult(response);
      setState(response.state);
      setDraftState({
        value: response.state.selectedSet,
        baseline: response.state.selectedSet,
        dirty: false
      });
      setMessage(resultMessage('Set loaded into the stream state.', response));
    } catch (error) {
      recordStartggFailure();
      setMessage(error instanceof Error ? error.message : t('operator:messages.selectSetFailed'));
    } finally {
      setLoading(false);
    }
  }

  function patchDraft(patch: Partial<SelectedSetState>) {
    setDraftState((current) =>
      current
        ? {
            value: {
              ...current.value,
              ...patch,
              playerOne: patch.playerOne ?? current.value.playerOne,
              playerTwo: patch.playerTwo ?? current.value.playerTwo
            },
            baseline: current.baseline,
            dirty: true
          }
        : current
    );
  }

  function changeDraftStyling(stylingGameId: GameId) {
    if (!draft) return;
    patchDraft({ stylingGameId });
  }

  function patchBroadcast(patch: Partial<NonNullable<SelectedSetState['broadcast']>>) {
    if (!draft) return;
    patchDraft({
      broadcast: {
        infoBarEnabled: false,
        logoEnabled: false,
        ...draft.broadcast,
        ...patch
      }
    });
  }

  async function reportStartggResult() {
    if (!selectedSet) {
      setMessage(t('operator:messages.reportSetRequired'));
      return;
    }
    if (!reportReadiness.ready) {
      setMessage(localizedReadinessReason(reportReadiness));
      return;
    }
    const result = reportReadiness.result;
    if (!window.confirm(
      t('operator:messages.reportConfirm', {
        winner: result.winnerName,
        playerOne: selectedSet.playerOne.name,
        scoreOne: selectedSet.playerOne.score,
        scoreTwo: selectedSet.playerTwo.score,
        playerTwo: selectedSet.playerTwo.name,
        history: result.gameData
          ? t('operator:messages.reportHistoryExact', { count: result.gameData.length })
          : t('operator:messages.reportHistoryWinnerOnly'),
        setId: result.setId
      })
    )) {
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      const response = await api.reportStartggSet({
        setId: result.setId,
        winnerId: result.winnerId,
        updatedAt: selectedSet.updatedAt,
        confirmed: true
      });
      setState(response.state);
      setDraftState({
        value: response.state.selectedSet,
        baseline: response.state.selectedSet,
        dirty: false
      });
      setTokenVerified(true);
      const resultNotice =
        response.reportedGameCount > 0
          ? t('operator:messages.reportExactSuccess', { winner: result.winnerName, winnerScore: result.winnerScore, loserScore: result.loserScore })
          : t('operator:messages.reportWinnerSuccess', { winner: result.winnerName });
      const refreshed = await refreshSetSelectorAfterReport();
      setMessage(refreshed ? resultNotice : `${resultNotice} ${t('operator:messages.selectorRefreshFailed')}`);
    } catch (error) {
      recordStartggFailure();
      setMessage(errorMessage(error, t('operator:messages.reportFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function reloadSelectedSetFromStartgg() {
    if (!selectedSet?.setId) {
      return;
    }
    if (
      !window.confirm(
        t('operator:messages.reloadConfirm')
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage(undefined);
    try {
      const response = await api.selectStartggSet(
        selectedSet.setId,
        selectedSet.gameId,
        {
          eventId: selectedSet.eventId,
          tournamentSlug: selectedSet.tournamentSlug,
          assetCatalogSlug: selectedSet.assetCatalogSlug ?? assetCatalogSlug,
          restoreOverrides: false,
          preserveBroadcast: true
        }
      );
      recordStartggResult(response);
      setState(response.state);
      setDraftState({
        value: response.state.selectedSet,
        baseline: response.state.selectedSet,
        dirty: false
      });
      setMessage(resultMessage('Bracket fields replaced with start.gg set data.', response));
    } catch (error) {
      recordStartggFailure();
      setMessage(errorMessage(error, t('operator:messages.reloadFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function updateScore(side: 'one' | 'two', score: number) {
    setLoading(true);
    setMessage(undefined);
    try {
      const response = await api.setScore(side, score);
      setState(response);
      setDraftState({ value: response.selectedSet, baseline: response.selectedSet, dirty: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('operator:messages.scoreFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function runStateAction(action: 'reset' | 'swap') {
    setLoading(true);
    setMessage(undefined);
    try {
      const response = action === 'reset' ? await api.resetScores() : await api.swapPlayers();
      setState(response);
      setDraftState({ value: response.selectedSet, baseline: response.selectedSet, dirty: false });
      setMessage(action === 'reset' ? t('operator:messages.scoresReset') : t('operator:messages.playersSwapped'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('operator:messages.stateFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function copyHandoffUrl(kind: LocalHandoffUrl) {
    try {
      await api.copyLocalUrl();
      setCopiedHandoff(kind);
      setMessage(t('operator:messages.obsCopied'));
    } catch (error) {
      setCopiedHandoff(undefined);
      setMessage(errorMessage(error, t('operator:messages.copyFailed')));
    }
  }

  const localizedScope = setScope
    ? setScope.type === 'event'
      ? t('operator:selector.scope.event')
      : setScope.type === 'phase'
        ? t('operator:selector.scope.phase')
        : setScope.type === 'phaseGroup'
          ? t('operator:selector.scope.pool')
          : t('operator:selector.scope.station', { number: setScope.stationNumber })
    : '';
  return (
    <main className="operator-shell">
      <TournamentBackdrop />
      <OperatorTopbar
        tokenVerified={tokenVerified}
        tokenSessionOnly={tokenSessionOnly}
        tokenConfigured={tokenConfigured}
        tokenStorageAvailable={tokenStorageAvailable}
        loading={loading}
        selectedSet={selectedSet}
      />
      <StartggPanel
        tokenInputRef={tokenInputRef}
        tokenConfigured={tokenConfigured}
        tokenStorageAvailable={tokenStorageAvailable}
        tokenSessionOnly={tokenSessionOnly}
        tokenVerified={tokenVerified}
        tokenInputReady={tokenInputReady}
        tournamentSlug={tournamentSlug}
        recentTournaments={recentTournaments}
        events={events}
        selectedEventId={selectedEventId}
        detectedGameId={detectedGameId}
        detectedProfile={detectedProfile}
        profiles={profiles}
        selectionGameId={selectionGameId}
        phases={phases}
        selectedPhaseId={selectedPhaseId}
        phaseGroups={phaseGroups}
        selectedPhaseGroupId={selectedPhaseGroupId}
        phaseGroupPageInfo={phaseGroupPageInfo}
        stationNumber={stationNumber}
        setScope={setScope}
        localBaseUrl={localBaseUrl}
        activeSet={selectedSet}
        logos={logos}
        loading={loading}
        reloadingAssets={reloadingAssets}
        assetCatalogRevision={assetCatalogRevision}
        countries={countries}
        onReloadAssets={() => void reloadAssets()}
        onTokenInputReady={setTokenInputReady}
        onSaveToken={() => void saveToken()}
        onRemoveToken={() => void removeToken()}
        onTournamentSlug={setTournamentSlug}
        onLoadEvents={(slug) => void loadEvents(slug)}
        onClearCache={() => void clearCachedBracketData()}
        onSelectEvent={(eventId) => void selectEvent(eventId)}
        onSelectionGame={setSelectionGameId}
        onSelectPhase={(phaseId) => void selectPhase(phaseId)}
        onSelectPhaseGroup={(groupId) => void selectPhaseGroup(groupId)}
        onStationNumber={setStationNumber}
        onBrowseStation={() => void browseStation()}
        onLoadPhaseGroups={(page) => void loadPhaseGroups(page)}
        onBrowseAllSets={() => void browseAllEventSets()}
        onRefreshScope={(scope) => void loadSets(scope, 1)}
      >
      {selectedSet && draft && (
        <section className="grid-layout wide">
          <SetSelectorPanel
            sets={sets}
            visibleSets={visibleSets}
            assignments={streamAssignments}
            scope={setScope}
            scopeLabel={localizedScope}
            pageInfo={setPageInfo}
            activeSetId={selectedSet.setId}
            search={setSearch}
            searchLoading={setSearchLoading}
            searchProgress={setSearchProgress}
            searchCatalogCount={setSearchCatalog?.length}
            searchCatalogIsCurrent={searchCatalogIsCurrent}
            selectedEvent={Boolean(selectedEventId)}
            draftDirty={draftDirty}
            modalOpen={Boolean(quickScore.target)}
            loading={loading}
            loadingMore={setPageLoading}
            gameProfileAvailable={Boolean(setLoadGameId)}
            onSearchFocus={focusSetSearch}
            onSearchChange={changeSetSearch}
            onCancelSearch={cancelSetSearch}
            onOpenSet={openSetFromSelector}
            onLoadMore={loadMoreSetsFromSelector}
          />

          <StreamEditorPanel
            draft={draft}
            selectedSet={selectedSet}
            profiles={profiles}
            countries={countries}
            logos={logos}
            selectedProfile={selectedProfile}
            assetCatalogSlug={assetCatalogSlug}
            assetCatalogRevision={assetCatalogRevision}
            dirty={draftDirty}
            saving={draftSaving}
            blocked={draftBlocked}
            loading={loading}
            onPatch={patchDraft}
            onChangeStyling={changeDraftStyling}
            onPatchBroadcast={patchBroadcast}
            onReload={() => void reloadSelectedSetFromStartgg()}
          />

          <LiveControlsPanel
            selectedSet={selectedSet}
            reportReadiness={reportReadiness}
            reportReadinessReason={localizedReadinessReason(reportReadiness)}
            localBaseUrl={localBaseUrl}
            copiedHandoff={copiedHandoff}
            loading={loading}
            draftDirty={draftDirty}
            onScore={(side, score) => void updateScore(side, score)}
            onReset={() => void runStateAction('reset')}
            onSwap={() => void runStateAction('swap')}
            onReport={() => void reportStartggResult()}
            onCopy={(kind) => void copyHandoffUrl(kind)}
          />
        </section>
      )}
      </StartggPanel>

      <SetActionsModal
        target={quickScore.target}
        quickScore={quickScore.scoreState}
        receipt={quickScore.receipt}
        quickReadiness={quickScore.readiness}
        quickReadinessReason={localizedReadinessReason(quickScore.readiness)}
        loading={loading}
        quickScoreLoading={quickScore.loading}
        gameProfileAvailable={Boolean(setLoadGameId)}
        onClose={quickScore.close}
        onSendToStream={(setId) => {
          quickScore.close();
          void selectSet(setId);
        }}
        onBeginQuickScore={() => void quickScore.begin()}
        onChangeBestOf={quickScore.changeBestOf}
        onChangeScore={quickScore.changeScore}
        onResetScores={quickScore.resetScores}
        onReport={() => void quickScore.report()}
      />
    </main>
  );
}
