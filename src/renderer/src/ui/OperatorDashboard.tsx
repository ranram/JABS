import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameIdForStartggVideogame, type GameProfile } from '@shared/gameProfiles';
import { gameAssetCatalogSlug } from '@shared/gameAssetCatalog';
import type { CountryOption, LogoAsset, SelectedSetState, StartggResultMeta } from '@shared/models';
import { startggReportReadiness } from '@shared/startggReporting';
import { api } from '../api';
import { useOverlayState } from '../hooks/useOverlayState';
import { useOperatorDraft } from './operator/useOperatorDraft';
import { useSetSelectorActions } from './operator/useSetSelectorActions';
import { filterLoadedSets } from '../setSearch';
import { TournamentBackdrop } from './ControlDeck';
import { SetActionsModal } from './operator/SetActionsModal';
import { SetSelectorPanel } from './operator/SetSelectorPanel';
import { StreamEditorPanel } from './operator/StreamEditorPanel';
import { LiveControlsPanel } from './operator/LiveControlsPanel';
import { StartggPanel } from './operator/StartggPanel';
import { automaticScoreboardSelection, customScoreboardSelection } from '../customScoreboardSelection';
import { useBracketBrowser } from './operator/useBracketBrowser';
import { useQuickScoreActions } from './operator/useQuickScoreActions';
import { OperatorTopbar } from './operator/OperatorTopbar';
import { useOperatorNotifications } from './operator/useOperatorNotifications';
import { errorMessage, localizedReadinessReason } from './operator/operatorUtils';
import { useStreamDraftAutosave } from './operator/useStreamDraftAutosave';
import { useAssetCatalogReload } from './operator/useAssetCatalogReload';
import { useCharacterCatalogOptions } from './operator/useCharacterCatalogOptions';
import type { LocalHandoffUrl } from '../desktopRuntime';
import { useModerationRefresh } from './operator/useModerationRefresh';
import { useScoreShortcuts } from './operator/useScoreShortcuts';
import { swapSavedCommentators } from './operator/swapCommentators';
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
  const setMessage = useOperatorNotifications(stateError);
  const [loading, setLoading] = useState(false);
  const [draftState, setDraftState] = useOperatorDraft(state?.selectedSet);
  const persistentSetOverrides = useRef({ station: false, matchLength: false });
  const [copiedHandoff, setCopiedHandoff] = useState<LocalHandoffUrl>();
  const browser = useBracketBrowser({
    startgg: api,
    setMessage,
    setLoading,
    setTokenVerified,
    onContextChange: clearStreamState
  });
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
    unloadTournament: unloadBracketTournament,
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
    void api
      .logos()
      .then(({ logos }) => setLogos(logos))
      .catch(() => undefined);
    void Promise.all([api.gameProfiles(), api.countries(), api.tokenStatus(), api.recentTournaments(), api.health()])
      .then(([profileResponse, countryResponse, tokenStatus, recentResponse, health]) => {
        setProfiles(profileResponse.profiles);
        setCountries(countryResponse.countries);
        setTokenConfigured(tokenStatus.configured);
        setTokenStorageAvailable(tokenStatus.storageAvailable);
        setTokenSessionOnly(tokenStatus.sessionOnly);
        setRecentTournaments(recentResponse.tournaments);
        setApiPort(health.port);
        if (health.recoveryNotices.length) setMessage(health.recoveryNotices.join(' '), 'warning');
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : t('errors:localSettings'), 'error');
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
  const assetCatalogSlug = detectedGameId ?? gameAssetCatalogSlug(selectedEvent?.videogame) ?? draft?.assetCatalogSlug;
  const { reloadAssets, reloadingAssets } = useAssetCatalogReload({
    assetCatalogSlug,
    setLogos,
    setAssetCatalogRevision
  });
  const characterCatalog = useCharacterCatalogOptions(assetCatalogSlug, assetCatalogRevision);
  const characterOptions = characterCatalog.characters;
  const localBaseUrl = apiPort === undefined ? undefined : `http://127.0.0.1:${apiPort}`;
  const {
    saving: draftSaving,
    blocked: draftBlocked,
    withAutosavePaused
  } = useStreamDraftAutosave({
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
    () =>
      filterLoadedSets(
        deferredSetSearch.trim() && searchCatalogIsCurrent ? (setSearchCatalog ?? sets) : sets,
        deferredSetSearch
      ),
    [deferredSetSearch, searchCatalogIsCurrent, setSearchCatalog, sets]
  );
  const reportReadiness = selectedSet
    ? startggReportReadiness(selectedSet)
    : {
        ready: false as const,
        reason: 'Load a start.gg set before reporting a result.',
        reasonCode: 'set-missing' as const
      };
  const quickScore = useQuickScoreActions({
    startgg: api,
    setLoadGameId,
    selectedEventId,
    tournamentSlug,
    assetCatalogSlug,
    setMessage,
    setTokenVerified,
    refreshAfterReport: refreshSetSelectorAfterReport,
    readinessReason: localizedReadinessReason
  });
  const moderation = useModerationRefresh({
    selectedSet,
    assetCatalogSlug,
    setScope,
    quickScoreOpen: Boolean(quickScore.target),
    refreshQuickScore: quickScore.refreshModerated,
    refreshSets: (scope) => loadSets(scope, 1),
    setOverlayState: setState,
    setDraftState
  });
  const { openSetFromSelector, focusSetSearch, changeSetSearch, loadMoreSetsFromSelector } = useSetSelectorActions({
    open: quickScore.open,
    completeSearch: ensureCompleteSetSearchCatalog,
    loadMore: loadMoreSets,
    search: setSearch,
    setSearch: setSetSearch
  });
  function recordStartggResult(result: StartggResultMeta): void {
    setTokenVerified(result.source === 'live');
  }
  function recordStartggFailure(): void {
    setTokenVerified(false);
  }
  async function saveToken() {
    const token = tokenInputRef.current?.value.trim() ?? '';
    if (!token) {
      setMessage(t('operator:messages.enterToken'), 'warning');
      return;
    }

    setLoading(true);
    setMessage(undefined, 'info');
    try {
      const status = tokenStorageAvailable ? await api.setToken(token) : await api.setSessionToken(token);
      if (tokenInputRef.current) {
        tokenInputRef.current.value = '';
      }
      setTokenInputReady(false);
      setTokenConfigured(status.configured);
      setTokenStorageAvailable(status.storageAvailable);
      setTokenSessionOnly(status.sessionOnly);
      setTokenVerified(false);
      setMessage(
        status.sessionOnly ? t('operator:messages.sessionTokenSaved') : t('operator:messages.tokenSaved'),
        status.sessionOnly ? 'warning' : 'success'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('operator:messages.saveTokenFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }
  async function removeToken() {
    setLoading(true);
    setMessage(undefined, 'info');
    try {
      const status = await api.clearToken();
      setTokenConfigured(status.configured);
      setTokenStorageAvailable(status.storageAvailable);
      setTokenSessionOnly(status.sessionOnly);
      setTokenVerified(false);
      setMessage(t('operator:messages.tokenRemoved'), 'success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('operator:messages.removeTokenFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }
  async function selectSet(setId: string) {
    if (!selectedSet) {
      return;
    }
    if (!setLoadGameId) {
      setMessage('Choose a game profile before loading a set from this unrecognized event.', 'warning');
      return;
    }

    setLoading(true);
    setMessage(undefined, 'info');
    try {
      const response = await api.selectStartggSet(setId, setLoadGameId, {
        eventId: selectedEventId || undefined,
        tournamentSlug: tournamentSlug || undefined,
        assetCatalogSlug,
        preserveBroadcast: true,
        preserveStation: persistentSetOverrides.current.station,
        preserveMatchLength: persistentSetOverrides.current.matchLength && selectedSet.matchFormat !== 'first-to'
      });
      recordStartggResult(response);
      setState(response.state);
      setDraftState({
        value: response.state.selectedSet,
        baseline: response.state.selectedSet,
        dirty: false
      });
      setMessage('Set loaded into the stream state.', 'success');
    } catch (error) {
      recordStartggFailure();
      setMessage(error instanceof Error ? error.message : t('operator:messages.selectSetFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }
  function patchDraft(patch: Partial<SelectedSetState>) {
    if (Object.prototype.hasOwnProperty.call(patch, 'station')) {
      persistentSetOverrides.current.station = true;
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, 'bestOf') ||
      Object.prototype.hasOwnProperty.call(patch, 'matchFormat')
    ) {
      persistentSetOverrides.current.matchLength = true;
    }
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

  async function clearStreamState() {
    await withAutosavePaused(async () => {
      const response = await api.clearSelectedSet();
      setState(response);
      setDraftState({ value: response.selectedSet, baseline: response.selectedSet, dirty: false });
      persistentSetOverrides.current = { station: false, matchLength: false };
    });
  }
  async function unloadTournament() {
    setLoading(true);
    setMessage(undefined, 'info');
    try {
      await clearStreamState();
      unloadBracketTournament();
    } catch (error) {
      setMessage(errorMessage(error, t('operator:messages.tournamentUnloadFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function reportStartggResult() {
    if (!selectedSet) {
      setMessage(t('operator:messages.reportSetRequired'), 'warning');
      return;
    }
    if (!reportReadiness.ready) {
      setMessage(localizedReadinessReason(reportReadiness), 'warning');
      return;
    }
    const result = reportReadiness.result;
    if (
      !window.confirm(
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
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage(undefined, 'info');
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
          ? t('operator:messages.reportExactSuccess', {
              winner: result.winnerName,
              winnerScore: result.winnerScore,
              loserScore: result.loserScore
            })
          : t('operator:messages.reportWinnerSuccess', { winner: result.winnerName });
      const characterNotice =
        response.reportedCharacterSelectionCount > 0
          ? ` ${t('operator:messages.characterSelectionsReported', {
              count: response.reportedCharacterSelectionCount
            })}`
          : '';
      const refreshed = await refreshSetSelectorAfterReport();
      const completeNotice = `${resultNotice}${characterNotice}`;
      setMessage(
        refreshed ? completeNotice : `${completeNotice} ${t('operator:messages.selectorRefreshFailed')}`,
        refreshed ? 'success' : 'warning'
      );
    } catch (error) {
      recordStartggFailure();
      setMessage(errorMessage(error, t('operator:messages.reportFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function reloadSelectedSetFromStartgg() {
    if (!selectedSet?.setId) {
      return;
    }
    if (!window.confirm(t('operator:messages.reloadConfirm'))) {
      return;
    }

    setLoading(true);
    setMessage(undefined, 'info');
    try {
      const response = await api.selectStartggSet(selectedSet.setId, selectedSet.gameId, {
        eventId: selectedSet.eventId,
        tournamentSlug: selectedSet.tournamentSlug,
        assetCatalogSlug: selectedSet.assetCatalogSlug ?? assetCatalogSlug,
        restoreOverrides: false,
        preserveBroadcast: true,
        preserveStation: persistentSetOverrides.current.station,
        preserveMatchLength: persistentSetOverrides.current.matchLength && selectedSet.matchFormat !== 'first-to'
      });
      recordStartggResult(response);
      setState(response.state);
      setDraftState({
        value: response.state.selectedSet,
        baseline: response.state.selectedSet,
        dirty: false
      });
      const refreshedSet = response.state.selectedSet;
      const canRefreshHistory = Boolean(
        refreshedSet?.eventId && refreshedSet.playerOne.playerId && refreshedSet.playerTwo.playerId
      );
      if (!canRefreshHistory) {
        setMessage(t('operator:messages.reloadSetOnly'), 'success');
        return;
      }
      try {
        await api.refreshVersusHistory();
        setMessage(t('operator:messages.reloadSuccess'), 'success');
      } catch (error) {
        setMessage(
          `${t('operator:messages.reloadSetSuccess')} ${errorMessage(error, t('operator:messages.reloadHistoryFailed'))}`,
          'warning'
        );
      }
    } catch (error) {
      recordStartggFailure();
      setMessage(errorMessage(error, t('operator:messages.reloadFailed')), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function updateScore(side: 'one' | 'two', score: number) {
    setLoading(true);
    setMessage(undefined, 'info');
    try {
      const response = await api.setScore(side, score);
      setState(response);
      setDraftState({ value: response.selectedSet, baseline: response.selectedSet, dirty: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('operator:messages.scoreFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function runStateAction(action: 'reset' | 'swap') {
    setLoading(true);
    setMessage(undefined, 'info');
    try {
      const response = action === 'reset' ? await api.resetScores() : await api.swapPlayers();
      setState(response);
      setDraftState({ value: response.selectedSet, baseline: response.selectedSet, dirty: false });
      setMessage(
        action === 'reset' ? t('operator:messages.scoresReset') : t('operator:messages.playersSwapped'),
        'success'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('operator:messages.stateFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copyHandoffUrl(kind: LocalHandoffUrl) {
    try {
      await api.copyLocalUrl(kind);
      setCopiedHandoff(kind);
      setMessage(t('operator:messages.obsCopied'), 'success');
    } catch (error) {
      setCopiedHandoff(undefined);
      setMessage(errorMessage(error, t('operator:messages.copyFailed')), 'error');
    }
  }

  const keyboardShortcuts = useScoreShortcuts({
    selectedSet,
    disabled: loading || draftDirty || draftSaving,
    modalOpen: Boolean(quickScore.target),
    onScore: updateScore,
    onReset: () => void runStateAction('reset'),
    onSwap: () => void runStateAction('swap'),
    onSwapCommentators: () =>
      void swapSavedCommentators()
        .then(() => setMessage(t('operator:messages.commentatorsSwapped'), 'success'))
        .catch((error) => setMessage(errorMessage(error, t('operator:messages.stateFailed')), 'error'))
  });

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
        updateBlocked={loading || draftDirty || draftSaving || Boolean(quickScore.target)}
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
        keyboardShortcuts={keyboardShortcuts}
        bracketRefresh={browser.bracketRefresh}
        reloadWarning={
          !selectedSet?.setId
            ? t('operator:editor.selectMatch')
            : draftDirty || draftSaving
              ? t('operator:editor.waitSave')
              : undefined
        }
        localBaseUrl={localBaseUrl}
        copiedHandoff={copiedHandoff}
        activeSet={selectedSet}
        logos={logos}
        loading={loading}
        reloadingAssets={reloadingAssets}
        reloadSelectedSetDisabled={!selectedSet?.setId || loading || draftDirty || draftSaving}
        unloadTournamentDisabled={loading || draftSaving}
        assetCatalogRevision={assetCatalogRevision}
        moderationRevision={moderation.moderationRevision}
        countries={countries}
        onReloadAssets={() => void reloadAssets()}
        onTokenInputReady={setTokenInputReady}
        onSaveToken={() => void saveToken()}
        onRemoveToken={() => void removeToken()}
        onTournamentSlug={setTournamentSlug}
        onLoadEvents={(slug) => void loadEvents(slug)}
        onUnloadTournament={() => void unloadTournament()}
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
        onReloadSelectedSet={() => void reloadSelectedSetFromStartgg()}
        onCustomScoreboard={(id, revision) =>
          draft
            ? patchDraft(customScoreboardSelection(id, revision))
            : setMessage(t('operator:customScoreboard.loadSetFirst'), 'warning')
        }
        onMessage={setMessage}
        onModerationApplied={() => void moderation.refreshAfterModeration()}
        onCopy={(kind) => void copyHandoffUrl(kind)}
        setSelector={
          <SetSelectorPanel
            sets={sets}
            visibleSets={visibleSets}
            assignments={streamAssignments}
            scope={setScope}
            scopeLabel={localizedScope}
            pageInfo={setPageInfo}
            activeSetId={selectedSet?.setId}
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
        }
      >
        {selectedSet && draft && (
          <section className="grid-layout wide">
            <StreamEditorPanel
              draft={draft}
              profiles={profiles}
              countries={countries}
              logos={logos}
              selectedProfile={selectedProfile}
              characters={characterOptions}
              characterAssets={characterCatalog.assets}
              allowExhibitionFormats={!selectedEventId && events.length === 0}
              dirty={draftDirty}
              saving={draftSaving}
              blocked={draftBlocked}
              onPatch={patchDraft}
              onChangeStyling={(gameId) => patchDraft(automaticScoreboardSelection(gameId))}
              onPatchBroadcast={patchBroadcast}
            />

            <LiveControlsPanel
              selectedSet={selectedSet}
              reportingEnabled={tokenConfigured}
              reportReadiness={reportReadiness}
              reportReadinessReason={localizedReadinessReason(reportReadiness)}
              localBaseUrl={localBaseUrl}
              copiedHandoff={copiedHandoff}
              loading={loading || draftSaving}
              draftDirty={draftDirty}
              onScore={(side, score) => void updateScore(side, score)}
              onReset={() => void runStateAction('reset')}
              onSwap={() => void runStateAction('swap')}
              shortcutsEnabled={keyboardShortcuts.enabled}
              onReport={() => void reportStartggResult()}
              onCopy={(kind) => void copyHandoffUrl(kind)}
            />
          </section>
        )}
      </StartggPanel>

      <SetActionsModal
        target={quickScore.target}
        reportingEnabled={tokenConfigured}
        quickScore={quickScore.scoreState}
        receipt={quickScore.receipt}
        quickReadiness={quickScore.readiness}
        quickReadinessReason={localizedReadinessReason(quickScore.readiness)}
        loading={loading}
        quickScoreLoading={quickScore.loading}
        gameProfileAvailable={Boolean(setLoadGameId)}
        characterOptions={characterOptions}
        onClose={quickScore.close}
        onSendToStream={(setId) => {
          quickScore.close();
          void selectSet(setId);
        }}
        onBeginQuickScore={() => void quickScore.begin()}
        onChangeBestOf={quickScore.changeBestOf}
        onChangeScore={quickScore.changeScore}
        onChangeCharacters={quickScore.changeCharacters}
        onResetScores={quickScore.resetScores}
        onReport={() => void quickScore.report()}
      />
    </main>
  );
}
