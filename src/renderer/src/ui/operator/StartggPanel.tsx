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
  TextInput,
  Title
} from '@mantine/core';
import { useEffect, useMemo, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import type {
  CountryOption,
  RecentTournament,
  LogoAsset,
  SelectedSetState,
  StartggEvent,
  StartggPageInfo,
  StartggPhase,
  StartggPhaseGroup,
  StartggSetScope
} from '@shared/models';
import { PaginationControls } from './ScoreControls';
import { MediaFolderControls } from './MediaFolderControls';
import { sortByLabel } from './operatorUtils';
import { OtherOverlaysPanel } from './WorkspacePanels';
import { ThumbnailGenerator } from './ThumbnailGenerator';
import { useThumbnailDraft } from './useThumbnailDraft';
import { TopEightGenerator } from './TopEightGenerator';
import { useTopEightDraft } from './useTopEightDraft';
import { generatorGameContext } from './generatorGameContext';

type StartggPanelProps = {
  tokenInputRef: RefObject<HTMLInputElement | null>;
  tokenConfigured: boolean;
  tokenStorageAvailable: boolean;
  tokenSessionOnly: boolean;
  tokenVerified: boolean;
  tokenInputReady: boolean;
  tournamentSlug: string;
  recentTournaments: RecentTournament[];
  events: StartggEvent[];
  selectedEventId: string;
  detectedGameId?: GameId;
  detectedProfile?: GameProfile;
  profiles: GameProfile[];
  selectionGameId: GameId | '';
  phases: StartggPhase[];
  selectedPhaseId: string;
  phaseGroups: StartggPhaseGroup[];
  selectedPhaseGroupId: string;
  phaseGroupPageInfo?: StartggPageInfo;
  stationNumber: string;
  setScope?: StartggSetScope;
  localBaseUrl?: string;
  activeSet?: SelectedSetState;
  logos: LogoAsset[];
  loading: boolean;
  reloadingAssets: boolean;
  assetCatalogRevision: number;
  countries: CountryOption[];
  onReloadAssets(): void;
  onTokenInputReady(ready: boolean): void;
  onSaveToken(): void;
  onRemoveToken(): void;
  onTournamentSlug(slug: string): void;
  onLoadEvents(slug?: string): void;
  onClearCache(): void;
  onSelectEvent(eventId: string): void;
  onSelectionGame(gameId: GameId | ''): void;
  onSelectPhase(phaseId: string): void;
  onSelectPhaseGroup(phaseGroupId: string): void;
  onStationNumber(station: string): void;
  onBrowseStation(): void;
  onLoadPhaseGroups(page: number): void;
  onBrowseAllSets(): void;
  onRefreshScope(scope: StartggSetScope): void;
  children?: ReactNode;
};

export function StartggPanel({
  tokenInputRef,
  tokenConfigured,
  tokenStorageAvailable,
  tokenSessionOnly,
  tokenVerified,
  tokenInputReady,
  tournamentSlug,
  recentTournaments,
  events,
  selectedEventId,
  detectedGameId,
  detectedProfile,
  profiles,
  selectionGameId,
  phases,
  selectedPhaseId,
  phaseGroups,
  selectedPhaseGroupId,
  phaseGroupPageInfo,
  stationNumber,
  setScope,
  localBaseUrl,
  activeSet,
  logos,
  loading,
  reloadingAssets,
  assetCatalogRevision,
  countries,
  onReloadAssets,
  onTokenInputReady,
  onSaveToken,
  onRemoveToken,
  onTournamentSlug,
  onLoadEvents,
  onClearCache,
  onSelectEvent,
  onSelectionGame,
  onSelectPhase,
  onSelectPhaseGroup,
  onStationNumber,
  onBrowseStation,
  onLoadPhaseGroups,
  onBrowseAllSets,
  onRefreshScope,
  children
}: StartggPanelProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedEvents = useMemo(() => sortByLabel(events, (event) => event.name, locale), [events, locale]);
  const sortedGameProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.label, locale),
    [profiles, locale]
  );
  const sortedPhases = useMemo(() => sortByLabel(phases, (phase) => phase.name, locale), [phases, locale]);
  const sortedPhaseGroups = useMemo(
    () => sortByLabel(phaseGroups, (group) => group.displayIdentifier, locale),
    [phaseGroups, locale]
  );
  const selectedEvent = events.find((event) => String(event.id) === selectedEventId);
  const gameContext = generatorGameContext({
    selectedEventId,
    selectedEvent,
    detectedGameId,
    selectionGameId,
    activeSet
  });
  const assetCatalogSlug = gameContext.assetCatalogSlug;
  const topEight = useTopEightDraft(
    gameContext.gameId ?? activeSet?.gameId
  );
  const thumbnail = useThumbnailDraft(activeSet);
  useEffect(() => {
    if (!assetCatalogSlug) return;
    topEight.setAssetCatalogSlug(assetCatalogSlug);
    thumbnail.setAssetCatalogSlug(assetCatalogSlug);
  }, [assetCatalogSlug]);
  useEffect(() => {
    if (!gameContext.gameId && !gameContext.gameName) return;
    topEight.setGameContext(gameContext.gameId, gameContext.gameName);
    thumbnail.setGameContext(gameContext.gameId, gameContext.gameName);
  }, [gameContext.gameId, gameContext.gameName]);
  const statusLabel = tokenVerified
    ? t('operator:startgg.verified')
    : tokenSessionOnly
      ? t('operator:startgg.session')
      : tokenConfigured
        ? t('operator:startgg.stored')
        : t('operator:startgg.offline');

  return (
    <>
    <Paper className="panel startgg-panel" p="md" radius="lg" withBorder>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} size="h4">{t('operator:startgg.title')}</Title>
          <Text c="dimmed" size="sm">{t('operator:startgg.description')}</Text>
        </div>
        <Badge color={tokenVerified ? 'green' : tokenSessionOnly ? 'yellow' : tokenConfigured ? 'blue' : 'gray'}>
          {statusLabel}
        </Badge>
      </Group>

      <SimpleGrid type="container" cols={{ base: 1, '48rem': 2 }} mt="md">
        <Stack gap="sm" className="startgg-entry-block">
          <div>
            <Text fw={700}>{t('operator:startgg.apiAccess')}</Text>
            <Text size="xs" c="dimmed">{t('operator:startgg.tokenLocal')}</Text>
          </div>
          <Text size="sm" c="dimmed">
            {tokenStorageAvailable
              ? t('operator:startgg.secureStorage')
              : t('operator:startgg.sessionStorage')}
          </Text>
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
              <Button variant="default" disabled={loading} onClick={onRemoveToken}>
                {t('operator:startgg.removeToken')}
              </Button>
            )}
          </Group>
        </Stack>

        <Stack gap="sm" className="startgg-entry-block">
          <div>
            <Text fw={700}>{t('operator:startgg.tournament')}</Text>
            <Text size="xs" c="dimmed">{t('operator:startgg.tournamentHint')}</Text>
          </div>
          <Group align="flex-end" wrap="wrap" className="tournament-lookup-row">
            <TextInput
              data-testid="tournament-input"
              value={tournamentSlug}
              placeholder={t('operator:startgg.tournamentPlaceholder')}
              onChange={(event) => onTournamentSlug(event.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Button data-testid="load-events" disabled={loading || !tournamentSlug} onClick={() => onLoadEvents()}>
              {t('operator:startgg.loadEvents')}
            </Button>
          </Group>
          {recentTournaments.length > 0 && (
            <Group gap="xs" aria-label={t('operator:startgg.recentAria')}>
              <Text size="xs" c="dimmed">{t('operator:startgg.recent')}</Text>
              {recentTournaments.map((tournament) => (
                <Button key={tournament.slug} variant="subtle" size="compact-xs" disabled={loading} onClick={() => onLoadEvents(tournament.slug)}>
                  {tournament.slug}
                </Button>
              ))}
            </Group>
          )}
          <Group gap="xs">
            <Button data-testid="clear-startgg-cache" variant="subtle" color="red" size="compact-sm" disabled={loading} onClick={onClearCache}>
              {t('operator:startgg.clearCache')}
            </Button>
            <Text size="xs" c="dimmed">{t('operator:startgg.activeStateStays')}</Text>
          </Group>
        </Stack>
      </SimpleGrid>
    </Paper>

    <Tabs className="operator-workspaces" defaultValue="bracket" keepMounted={false} mt="md">
      <Tabs.List aria-label={t('operator:workspaces.aria')}
        style={{ 
          position: 'sticky', 
          top: 0, 
          zIndex: 10, 
          backgroundColor: 'var(--mantine-color-body)' // Prevents overlapping content from showing underneath
        }}
      >
        <Tabs.Tab value="bracket">{t('operator:workspaces.bracket')}</Tabs.Tab>
        <Tabs.Tab value="overlays">{t('operator:workspaces.otherOverlays')}</Tabs.Tab>
        <Tabs.Tab value="top-eight">{t('operator:workspaces.topEight')}</Tabs.Tab>
        <Tabs.Tab value="thumbnail">{t('operator:workspaces.thumbnail')}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="bracket" pt="md">
        <Paper className="panel bracket-workspace" p="md" radius="lg" withBorder>

      {detectedProfile && (
        <Group mt="md" gap="xs">
          <Text size="sm">{t('operator:startgg.detectedProfile')}</Text>
          <Badge variant="light">{detectedProfile.shortLabel}</Badge>
        </Group>
      )}

      <Select
        data-testid="event-select"
        mt="md"
        value={selectedEventId || null}
        disabled={loading}
        aria-label={t('operator:startgg.eventAria')}
        placeholder={t('operator:startgg.selectEvent')}
        searchable
        clearable
        data={sortedEvents.map((event) => ({ value: String(event.id), label: event.name }))}
        onChange={(value) => onSelectEvent(value ?? '')}
      />

      {assetCatalogSlug && (
        <Group mt="md" justify="space-between" align="center" wrap="wrap">
          <MediaFolderControls
            kind="game-assets"
            label={t('operator:browser.assetSlug')}
            subpath={`${assetCatalogSlug}/characters`}
          />
          <Button variant="default" size="compact-sm" loading={reloadingAssets} onClick={onReloadAssets}>
            {t('operator:browser.reloadAssets')}
          </Button>
        </Group>
      )}

      {selectedEventId && (
        <div className="bracket-browser">
          <div className="bracket-filter-row">
            <Select
              data-testid="selection-game-profile"
              label={t('operator:browser.gameProfile')}
              value={(detectedGameId ?? selectionGameId) || null}
              disabled={loading || Boolean(detectedGameId)}
              placeholder={t('operator:browser.chooseProfile')}
              searchable
              clearable
              description={detectedProfile
                ? t('operator:browser.detectedFromEvent', { profile: detectedProfile.label })
                : t('operator:browser.unknownGame')}
              data={sortedGameProfiles.map((profile) => ({ value: profile.id, label: profile.label }))}
              onChange={(value) => onSelectionGame((value ?? '') as GameId | '')}
            />
            <Select
              label={t('operator:browser.phase')}
              value={selectedPhaseId || null}
              disabled={loading || phases.length === 0}
              placeholder={t('operator:browser.allPhases')}
              searchable
              clearable
              data={sortedPhases.map((phase) => ({ value: String(phase.id), label: phase.name }))}
              onChange={(value) => onSelectPhase(value ?? '')}
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
              data={sortedPhaseGroups.map((group) => ({ value: String(group.id), label: group.displayIdentifier }))}
              onChange={(value) => onSelectPhaseGroup(value ?? '')}
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
                onChange={(value) => onStationNumber(String(value))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onBrowseStation();
                }}
                style={{ flex: 1 }}
              />
              <Button disabled={loading || !stationNumber} onClick={onBrowseStation}>
                {t('operator:browser.browse')}
              </Button>
            </Group>
          </div>

          {phaseGroupPageInfo && phaseGroupPageInfo.totalPages > 1 && (
            <PaginationControls
              label={t('operator:browser.poolPages')}
              pageInfo={phaseGroupPageInfo}
              disabled={loading}
              onPage={onLoadPhaseGroups}
            />
          )}
          <Group>
            <Button variant="default" disabled={loading} onClick={onBrowseAllSets}>
              {t('operator:browser.allEventSets')}
            </Button>
            <Button
              variant="default"
              disabled={loading || !setScope}
              onClick={() => setScope && onRefreshScope(setScope)}
            >
              {t('operator:browser.refresh')}
            </Button>
          </Group>
        </div>
      )}
        </Paper>
        {children}
      </Tabs.Panel>

      <Tabs.Panel value="overlays" pt="md">
        <OtherOverlaysPanel
          localBaseUrl={localBaseUrl}
          logos={logos}
          activeSet={activeSet}
          profiles={profiles}
          assetCatalogSlug={assetCatalogSlug}
        />
      </Tabs.Panel>

      <Tabs.Panel value="top-eight" pt="md">
        <TopEightGenerator
          controller={topEight}
          profiles={profiles}
          selectedEventId={selectedEventId}
          logos={logos}
          assetCatalogRevision={assetCatalogRevision}
          countries={countries}
        />
      </Tabs.Panel>

      <Tabs.Panel value="thumbnail" pt="md">
        <ThumbnailGenerator
          controller={thumbnail}
          profiles={profiles}
          activeSet={activeSet}
          logos={logos}
          assetCatalogRevision={assetCatalogRevision}
          countries={countries}
        />
      </Tabs.Panel>
    </Tabs>
    </>
  );
}
