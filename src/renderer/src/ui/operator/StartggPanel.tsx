import { ImportEventPlayers } from '../players/ImportEventPlayers';
import { DestructiveButton } from '../DestructiveButton';
import type { NoticeSink } from './operatorNotice';
import {
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput
} from '@mantine/core';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveStartggGameProfileId, type GameId, type GameProfile } from '@shared/gameProfiles';
import type { CountryOption, LogoAsset, SelectedSetState } from '@shared/models';
import { PaginationControls } from './ScoreControls';
import { MediaFolderControls } from './MediaFolderControls';
import { sortByLabel } from './operatorUtils';
import { OtherOverlaysPanel } from './WorkspacePanels';
import { StingersPanel } from '../stingers/StingersPanel';
import { ThumbnailGenerator } from './ThumbnailGenerator';
import { useThumbnailDraft } from './useThumbnailDraft';
import { TopEightGenerator } from './TopEightGenerator';
import { useTopEightDraft } from './useTopEightDraft';
import { useGameAssetPreparation, type GameAssetSelection } from './useGameAssetPreparation';
import { GameSelect } from './GameSelect';
import { api, invalidateCatalogRasterCache } from '../../api';
import { generatorGameContext, standaloneGameContext } from './generatorGameContext';
import { CustomScoreboardPanel } from './CustomScoreboardPanel';
import { WorkspaceMaintenanceBar } from './WorkspaceMaintenanceBar';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import { BracketRefreshStatus } from './BracketRefreshStatus';
import { PanelHeader } from '../PanelHeader';
import type { BracketController } from './bracketController';
import { displayPhaseName } from '@shared/matchContext';
import type { CharacterCatalogOptions } from './useCharacterCatalogOptions';

type StartggPanelProps = {
  bracket: BracketController;
  keyboardShortcuts: { enabled: boolean; setEnabled(value: boolean): void };
  reloadWarning?: string;
  tokenInputRef: RefObject<HTMLInputElement | null>;
  tokenConfigured: boolean;
  tokenStorageAvailable: boolean;
  tokenSessionOnly: boolean;
  tokenVerified: boolean;
  tokenInputReady: boolean;
  detectedGameId?: GameId;
  detectedProfile?: GameProfile;
  profiles: GameProfile[];
  localBaseUrl?: string;
  copiedHandoff?: LocalHandoffUrl;
  activeSet?: SelectedSetState;
  streamDraft?: SelectedSetState;
  streamCharacterCatalog?: CharacterCatalogOptions;
  streamPending?: boolean;
  onPatchStream?(patch: Partial<SelectedSetState>): void;
  logos: LogoAsset[];
  loading: boolean;
  reloadingAssets: boolean;
  reloadSelectedSetDisabled: boolean;
  unloadTournamentDisabled: boolean;
  assetCatalogRevision: number;
  moderationRevision: number;
  countries: CountryOption[];
  onReloadAssets(): void;
  onTokenInputReady(ready: boolean): void;
  onSaveToken(): void;
  onRemoveToken(): void;
  onReloadSelectedSet(): void;
  onPatchBroadcast?(patch: Partial<NonNullable<SelectedSetState['broadcast']>>): void;
  onCustomScoreboard(scoreboardId?: string, revision?: string): void;
  onMessage: NoticeSink;
  onModerationApplied(): void;
  onCopy(kind: LocalHandoffUrl): void;
  setSelector?: ReactNode;
  children?: ReactNode;
};

export function StartggPanel({
  bracket,
  keyboardShortcuts,
  reloadWarning,
  tokenInputRef,
  tokenConfigured,
  tokenStorageAvailable,
  tokenSessionOnly,
  tokenVerified,
  tokenInputReady,
  detectedGameId,
  detectedProfile,
  profiles,
  localBaseUrl,
  copiedHandoff,
  activeSet,
  streamDraft,
  streamCharacterCatalog,
  streamPending,
  onPatchStream,
  logos,
  loading,
  reloadingAssets,
  reloadSelectedSetDisabled,
  unloadTournamentDisabled,
  assetCatalogRevision,
  countries,
  onReloadAssets,
  onTokenInputReady,
  onSaveToken,
  onRemoveToken,
  onReloadSelectedSet,
  onPatchBroadcast,
  onCustomScoreboard,
  onMessage,
  moderationRevision,
  onModerationApplied,
  onCopy,
  setSelector,
  children
}: StartggPanelProps) {
  const {
    bracketRefresh,
    tournamentSlug,
    tournamentLoaded,
    recentTournaments,
    events,
    selectedEventId,
    selectionGameId,
    phases,
    selectedPhaseId,
    phaseGroups,
    selectedPhaseGroupId,
    phaseGroupPageInfo,
    stationNumber,
    setScope
  } = bracket.state;
  const [workspace, setWorkspace] = useState('bracket');
  const stickyHeader = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = stickyHeader.current;
    if (!header) return;
    const parent = header.closest<HTMLElement>('.operator-workspaces');
    const measure = () => parent?.style.setProperty('--workspace-header-height', `${header.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const { t, i18n } = useTranslation(['operator', 'common']);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedEvents = useMemo(() => sortByLabel(events, (event) => event.name, locale), [events, locale]);
  const sortedGameProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.label, locale),
    [profiles, locale]
  );
  const sortedPhases = useMemo(
    () => sortByLabel(phases, (phase) => displayPhaseName(phase.name), locale),
    [phases, locale]
  );
  const sortedPhaseGroups = useMemo(
    () => sortByLabel(phaseGroups, (group) => group.displayIdentifier, locale),
    [phaseGroups, locale]
  );
  const selectedEvent = events.find((event) => String(event.id) === selectedEventId);
  const gameContext = generatorGameContext({
    selectedEventId,
    tournamentLoaded,
    selectedEvent,
    detectedGameId,
    selectionGameId,
    activeSet
  });
  const assetCatalogSlug = gameContext.assetCatalogSlug;
  // Keep the English navigation order in every language, with brackets first.
  const workspaces = [
    { id: 'bracket', label: t('operator:workspaces.bracket') },
    { id: 'custom-scoreboard', label: t('operator:workspaces.customScoreboard') },
    { id: 'overlays', label: t('operator:workspaces.otherOverlays') },
    { id: 'stingers', label: t('operator:workspaces.stingers') },
    { id: 'top-eight', label: t('operator:workspaces.topEight') },
    { id: 'thumbnail', label: t('operator:workspaces.thumbnail') }
  ];
  const [topEightGameSelection, setTopEightGameSelection] = useState<GameAssetSelection>();
  const [thumbnailGameSelection, setThumbnailGameSelection] = useState<GameAssetSelection>();
  const topEight = useTopEightDraft(gameContext.gameId ?? activeSet?.gameId);
  const thumbnail = useThumbnailDraft(activeSet, tournamentLoaded && assetCatalogSlug ? gameContext : undefined);
  const eventVideogameId = selectedEvent?.videogame?.id;
  const eventGameSelection = { assetCatalogSlug, videogameId: eventVideogameId };
  const topEightPreparation = useGameAssetPreparation(
    tournamentLoaded ? assetCatalogSlug : topEight.draft.assetCatalogSlug,
    tournamentLoaded ? eventGameSelection : topEightGameSelection
  );
  const thumbnailPreparation = useGameAssetPreparation(
    tournamentLoaded ? assetCatalogSlug : thumbnail.draft.assetCatalogSlug,
    tournamentLoaded ? eventGameSelection : thumbnailGameSelection
  );
  useEffect(() => {
    let leftApp = false;
    let timer: number | undefined;
    const leave = () => {
      leftApp = true;
      window.clearTimeout(timer);
    };
    const refresh = () => {
      if (!leftApp) return;
      leftApp = false;
      timer = window.setTimeout(() => {
        void api.reloadAssets().catch(() => invalidateCatalogRasterCache());
      }, 200);
    };
    window.addEventListener('blur', leave);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    if (!tournamentLoaded || !assetCatalogSlug) return;
    if (eventVideogameId) {
      const selection = { videogameId: eventVideogameId, assetCatalogSlug };
      setTopEightGameSelection(selection);
      setThumbnailGameSelection(selection);
    }
    topEight.setGameContext(gameContext.gameId, gameContext.gameName, assetCatalogSlug);
    thumbnail.setGameContext(gameContext.gameId, gameContext.gameName, assetCatalogSlug);
  }, [tournamentLoaded, gameContext.gameId, gameContext.gameName, assetCatalogSlug, eventVideogameId]);
  const statusLabel = !tokenConfigured
    ? t('operator:startgg.publicAccess')
    : tokenVerified
      ? t('operator:startgg.verified')
      : tokenSessionOnly
        ? t('operator:startgg.session')
        : t('operator:startgg.stored');

  return (
    <>
      <Paper className="panel startgg-panel" p="md" radius="lg" withBorder>
        <PanelHeader title={t('operator:startgg.title')} description={t('operator:startgg.description')}>
          <Group gap="sm" justify="flex-end">
            <BracketRefreshStatus refresh={bracketRefresh} />
            <Badge color={!tokenConfigured ? 'gray' : tokenVerified ? 'green' : tokenSessionOnly ? 'yellow' : 'blue'}>
              {statusLabel}
            </Badge>
          </Group>
        </PanelHeader>

        <SimpleGrid type="container" cols={{ base: 1, '48rem': 2 }} mt="md">
          <Stack gap="sm" className="startgg-entry-block operator-inset" data-tutorial="api-access">
            <div>
              <Text fw={700}>{t('operator:startgg.apiAccess')}</Text>
            </div>
            <PasswordInput
              ref={tokenInputRef}
              autoComplete="off"
              placeholder={t('operator:startgg.tokenPlaceholder')}
              disabled={loading}
              onChange={(event) => onTokenInputReady(Boolean(event.currentTarget.value.trim()))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && tokenInputReady) onSaveToken();
              }}
            />
            <Group>
              <Button disabled={loading || !tokenInputReady} onClick={onSaveToken}>
                {tokenStorageAvailable ? t('operator:startgg.saveToken') : t('operator:startgg.useForSession')}
              </Button>
              {tokenConfigured && (
                <DestructiveButton disabled={loading} onClick={onRemoveToken}>
                  {t('operator:startgg.removeToken')}
                </DestructiveButton>
              )}
            </Group>
            <div>
              <Text size="xs" c="dimmed">
                {t('operator:startgg.tokenLocal')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('operator:startgg.publicHelp')}
              </Text>
              {!tokenStorageAvailable && (
                <Text size="sm" c="dimmed">
                  {t('operator:startgg.sessionStorage')}
                </Text>
              )}
            </div>
          </Stack>

          <Stack gap="sm" className="startgg-entry-block operator-inset">
            <div>
              <Text fw={700}>{t('operator:startgg.tournament')}</Text>
            </div>
            <Group align="flex-end" wrap="wrap" className="tournament-lookup-row">
              <TextInput
                data-testid="tournament-input"
                value={tournamentSlug}
                placeholder={t('operator:startgg.tournamentPlaceholder')}
                onChange={(event) => bracket.actions.setTournamentSlug(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                data-testid="load-events"
                disabled={loading || !tournamentSlug}
                onClick={() => bracket.actions.loadEvents()}
              >
                {t('operator:startgg.loadEvents')}
              </Button>
            </Group>
            {recentTournaments.length > 0 && (
              <Group gap="xs" aria-label={t('operator:startgg.recentAria')}>
                <Text size="xs" c="dimmed">
                  {t('operator:startgg.recent')}
                </Text>
                {recentTournaments.map((tournament) => (
                  <Button
                    key={tournament.slug}
                    variant="subtle"
                    size="compact-xs"
                    disabled={loading}
                    onClick={() => bracket.actions.loadEvents(tournament.slug)}
                  >
                    {tournament.slug}
                  </Button>
                ))}
              </Group>
            )}
          </Stack>
        </SimpleGrid>
      </Paper>

      <Tabs
        className="operator-workspaces"
        value={workspace}
        onChange={(value) => value && setWorkspace(value)}
        keepMounted={false}
        mt="md"
      >
        <div ref={stickyHeader} className="workspace-sticky-header">
          <Tabs.List aria-label={t('operator:workspaces.aria')}>
            {workspaces.map((item) => (
              <Tabs.Tab key={item.id} value={item.id}>
                {item.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <WorkspaceMaintenanceBar
            activeSet={activeSet}
            assetCatalogSlug={
              workspace === 'top-eight'
                ? topEight.draft.assetCatalogSlug
                : workspace === 'thumbnail'
                  ? thumbnail.draft.assetCatalogSlug
                  : assetCatalogSlug
            }
            keyboardShortcuts={keyboardShortcuts}
            reloadWarning={reloadWarning}
            loading={loading}
            reloadingAssets={reloadingAssets}
            reloadSelectedSetDisabled={reloadSelectedSetDisabled}
            unloadTournamentDisabled={unloadTournamentDisabled}
            tournamentLoaded={tournamentLoaded}
            setScope={setScope}
            localBaseUrl={localBaseUrl}
            copiedHandoff={copiedHandoff}
            onReloadAssets={onReloadAssets}
            onReloadBracketData={bracket.actions.loadSets}
            onReloadSelectedSet={onReloadSelectedSet}
            onUnloadTournament={bracket.actions.unloadTournament}
            onClearCache={bracket.actions.clearCachedBracketData}
            onModerationApplied={onModerationApplied}
            onCopy={onCopy}
            onConfigureStingers={() => setWorkspace('stingers')}
            onTutorialWorkspace={setWorkspace}
          />
        </div>

        <Tabs.Panel value="bracket" pt="md">
          <div className="bracket-overview-grid">
            <Paper className="panel bracket-workspace" p="md" radius="lg" withBorder>
              {detectedProfile && (
                <Group mt="md" gap="xs">
                  <Text size="sm">{t('operator:startgg.detectedProfile')}</Text>
                  <Badge variant="light">{detectedProfile.shortLabel}</Badge>
                </Group>
              )}

              <Group mt="md" align="flex-end" gap="md">
                <Select
                  data-testid="event-select"
                  data-tutorial="event"
                  style={{ flex: '1 1 260px' }}
                  label={t('operator:startgg.selectEvent')}
                  value={selectedEventId || null}
                  disabled={loading}
                  aria-label={t('operator:startgg.eventAria')}
                  placeholder={t('operator:startgg.selectEvent')}
                  searchable
                  clearable
                  data={sortedEvents.map((event) => ({ value: String(event.id), label: event.name }))}
                  onChange={(value) => bracket.actions.selectEvent(value ?? '')}
                />

                {selectedEventId && <ImportEventPlayers eventId={selectedEventId} />}
              </Group>

              {assetCatalogSlug && (
                <Group mt="md" justify="space-between" align="center" wrap="wrap">
                  <MediaFolderControls
                    kind="game-assets"
                    label={t('operator:browser.assetSlug')}
                    subpath={`${assetCatalogSlug}/characters`}
                  />
                </Group>
              )}

              {selectedEventId && (
                <div className="bracket-browser">
                  <div className="bracket-filter-row">
                    <Select
                      data-testid="selection-game-profile"
                      label={t('operator:browser.gameProfile')}
                      value={resolveStartggGameProfileId(selectedEvent?.videogame, selectionGameId)}
                      disabled={loading || Boolean(detectedGameId)}
                      placeholder={t('operator:browser.chooseProfile')}
                      searchable
                      clearable
                      description={
                        detectedProfile
                          ? t('operator:browser.detectedFromEvent', { profile: detectedProfile.label })
                          : t('operator:browser.unknownGame')
                      }
                      inputWrapperOrder={['label', 'input', 'description', 'error']}
                      data={sortedGameProfiles.map((profile) => ({ value: profile.id, label: profile.label }))}
                      onChange={(value) => bracket.actions.setSelectionGameId((value ?? '') as GameId | '')}
                    />
                    <Select
                      label={t('operator:browser.phase')}
                      value={selectedPhaseId || null}
                      disabled={loading || phases.length === 0}
                      placeholder={t('operator:browser.allPhases')}
                      searchable
                      clearable
                      data={sortedPhases.map((phase) => ({
                        value: String(phase.id),
                        label: displayPhaseName(phase.name)
                      }))}
                      onChange={(value) => bracket.actions.selectPhase(value ?? '')}
                    />
                  </div>
                  <div className="bracket-filter-row">
                    <Select
                      label={t('operator:browser.pool')}
                      value={selectedPhaseGroupId || null}
                      disabled={loading || !selectedPhaseId || phaseGroups.length === 0}
                      placeholder={t('operator:browser.allPools')}
                      searchable
                      clearable
                      data={sortedPhaseGroups.map((group) => ({
                        value: String(group.id),
                        label: group.displayIdentifier
                      }))}
                      onChange={(value) => bracket.actions.selectPhaseGroup(value ?? '')}
                    />
                    <Group align="flex-end" wrap="nowrap">
                      <NumberInput
                        label={t('operator:browser.stationNumber')}
                        min={1}
                        step={1}
                        value={stationNumber}
                        placeholder={t('operator:browser.stationPlaceholder')}
                        disabled={loading}
                        allowDecimal={false}
                        onChange={(value) => bracket.actions.setStationNumber(String(value))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') bracket.actions.browseStation();
                        }}
                        style={{ flex: 1 }}
                      />
                      <Button disabled={loading || !stationNumber} onClick={bracket.actions.browseStation}>
                        {t('operator:browser.browse')}
                      </Button>
                    </Group>
                  </div>

                  {phaseGroupPageInfo && phaseGroupPageInfo.totalPages > 1 && (
                    <PaginationControls
                      label={t('operator:browser.poolPages')}
                      pageInfo={phaseGroupPageInfo}
                      disabled={loading}
                      onPage={bracket.actions.loadPhaseGroups}
                    />
                  )}
                  <Group>
                    <Button variant="default" disabled={loading} onClick={bracket.actions.browseAllEventSets}>
                      {t('operator:browser.allEventSets')}
                    </Button>
                  </Group>
                </div>
              )}
            </Paper>
            {setSelector}
          </div>
          {children}
        </Tabs.Panel>

        <Tabs.Panel value="custom-scoreboard" pt="md" keepMounted>
          <CustomScoreboardPanel
            activeSet={streamDraft ?? activeSet}
            activeScoreboardId={(streamDraft ?? activeSet)?.customScoreboardId}
            onPatchBroadcast={onPatchBroadcast}
            onSelect={onCustomScoreboard}
            onMessage={onMessage}
          />
        </Tabs.Panel>

        <Tabs.Panel value="overlays" pt="md">
          <OtherOverlaysPanel
            streamDraft={streamDraft}
            characterCatalog={streamCharacterCatalog}
            streamPending={streamPending}
            onPatchStream={onPatchStream}
            assetCatalogRevision={assetCatalogRevision}
            localBaseUrl={localBaseUrl}
            logos={logos}
            activeSet={activeSet}
            profiles={profiles}
            assetCatalogSlug={assetCatalogSlug}
            selectedEventId={selectedEventId}
            selectedEventName={selectedEvent?.name}
            phases={phases}
          />
        </Tabs.Panel>

        <Tabs.Panel value="stingers" pt="md">
          <StingersPanel activeSet={activeSet} localBaseUrl={localBaseUrl} />
        </Tabs.Panel>

        <Tabs.Panel value="top-eight" pt="md">
          <TopEightGenerator
            gameContextReady={!tournamentLoaded || Boolean(selectedEvent?.videogame)}
            gameSelector={
              <GameSelect
                tournamentLoaded={tournamentLoaded}
                eventGameName={selectedEvent?.videogame?.name}
                gameName={topEight.draft.gameName}
                preparation={topEightPreparation}
                onChange={(game) => {
                  const context = standaloneGameContext(game);
                  setTopEightGameSelection({ videogameId: game.id, assetCatalogSlug: context.assetCatalogSlug });
                  topEight.setGameContext(context.gameId, context.gameName, context.assetCatalogSlug);
                }}
              />
            }
            controller={topEight}
            profiles={profiles}
            selectedEventId={selectedEventId}
            moderationRevision={moderationRevision}
            logos={logos}
            assetCatalogRevision={assetCatalogRevision}
            countries={countries}
          />
        </Tabs.Panel>

        <Tabs.Panel value="thumbnail" pt="md">
          <ThumbnailGenerator
            gameContextReady={!tournamentLoaded || Boolean(selectedEvent?.videogame)}
            gameSelector={
              <GameSelect
                tournamentLoaded={tournamentLoaded}
                eventGameName={selectedEvent?.videogame?.name}
                gameName={thumbnail.draft.gameName}
                preparation={thumbnailPreparation}
                onChange={(game) => {
                  const context = standaloneGameContext(game);
                  setThumbnailGameSelection({ videogameId: game.id, assetCatalogSlug: context.assetCatalogSlug });
                  thumbnail.setGameContext(context.gameId, context.gameName, context.assetCatalogSlug);
                }}
              />
            }
            controller={thumbnail}
            selectedEventId={selectedEventId}
            profiles={profiles}
            activeSet={activeSet}
            moderationRevision={moderationRevision}
            logos={logos}
            assetCatalogRevision={assetCatalogRevision}
            countries={countries}
          />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
