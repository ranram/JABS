import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, Group, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import type { LogoAsset, SelectedSetState } from '@shared/models';
import {
  clampMediaTransform,
  defaultMediaTransform,
  playerMediaModeIds,
  type PlayerMediaMode,
  type MediaLayerKind,
  type MediaTransform
} from '@shared/mediaPlacement';
import { api } from '../../api';
import { historyForMatch, versusHistoryMatch, versusPresentationMode } from '@shared/versusScreen';
import { useVersusScreenState } from '../../hooks/useVersusScreenState';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { VersusPreview } from './VersusPreview';
import { useTranslation } from 'react-i18next';
import { sortByLabel } from './operatorUtils';
import { MediaControlHint } from './MediaControlHint';
import { OverlayLogoSelect } from './OverlayLogoSelect';
import { VersusStatControls } from './VersusStatControls';
import { VersusCharacterControls } from './VersusCharacterControls';
import type { CharacterCatalogOptions } from './useCharacterCatalogOptions';

type VersusScreenControlsProps = {
  activeSet?: SelectedSetState;
  profiles: GameProfile[];
  logos: LogoAsset[];
  characterCatalog?: CharacterCatalogOptions;
  pendingChanges?: boolean;
  onPatch?(patch: Partial<SelectedSetState>): void;
  sourceLinks?: ReactNode;
};

export function VersusScreenControls({
  activeSet,
  profiles,
  logos,
  characterCatalog,
  pendingChanges,
  onPatch,
  sourceLinks
}: VersusScreenControlsProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const { state, saving, update, reload } = useSettingsDraft({
    load: api.versusScreenState,
    save: api.updateVersusScreenState,
    onError: notify
  });
  const { state: liveSettings } = useVersusScreenState();
  useEffect(() => {
    if (!saving) void reload();
  }, [liveSettings, saving, reload]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<{ player: 0 | 1; layer: MediaLayerKind }>();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.styleName, locale),
    [profiles, locale]
  );
  const placementContext = JSON.stringify([
    activeSet?.setId,
    activeSet?.eventId,
    activeSet?.assetCatalogSlug ?? activeSet?.gameId,
    activeSet?.videogameId,
    state?.mediaMode,
    [activeSet?.playerOne, activeSet?.playerTwo].map((player) => [
      player?.localPlayerId,
      player?.playerId,
      player?.name,
      player?.characters,
      player?.character,
      player?.characterAssetId,
      player?.playerPhotoAssetId
    ])
  ]);
  const latestPlacementContext = useRef(placementContext);
  latestPlacementContext.current = placementContext;
  useEffect(() => setSelectedLayer(undefined), [placementContext, state?.mediaMode]);

  function updatePlacement(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform) {
    if (
      refreshing ||
      (state?.mediaMode !== 'combined' && layer !== (state?.mediaMode === 'photo' ? 'photo' : 'character'))
    )
      return;
    void update(
      (current) =>
        latestPlacementContext.current !== placementContext || current.mediaMode !== state?.mediaMode
          ? current
          : {
              ...current,
              mediaPlacements: [
                player === 0
                  ? { ...current.mediaPlacements[0], [layer]: clampMediaTransform(transform) }
                  : current.mediaPlacements[0],
                player === 1
                  ? { ...current.mediaPlacements[1], [layer]: clampMediaTransform(transform) }
                  : current.mediaPlacements[1]
              ]
            },
      1_000
    );
  }

  const placementOptions = useMemo(() => {
    if (!activeSet || !state) return [];
    const layers: MediaLayerKind[] =
      state.mediaMode === 'combined' ? ['character', 'photo'] : [state.mediaMode === 'photo' ? 'photo' : 'character'];
    return [activeSet.playerOne.name, activeSet.playerTwo.name].flatMap((name, player) =>
      layers.map((layer) => ({
        value: `${player}:${layer}`,
        label: t(layer === 'photo' ? 'thumbnail.adjustPhoto' : 'thumbnail.adjustCharacter', { player: name })
      }))
    );
  }, [activeSet, state?.mediaMode, t]);

  async function refreshHistory() {
    setRefreshing(true);
    try {
      await api.refreshVersusHistory();
      await reload();
      notifications.show({
        color: 'green',
        title: t('workspaces.versusScreen.historyUpdated'),
        message: t('workspaces.versusScreen.historyUpdatedHelp')
      });
    } catch (error) {
      notify(error);
    } finally {
      setRefreshing(false);
    }
  }

  if (!state)
    return (
      <Text c="dimmed" size="sm">
        {t('workspaces.versusScreen.loadingScreenSettings')}
      </Text>
    );
  const historyState = liveSettings ?? state;
  const history = historyForMatch(historyState, activeSet);
  const historyCount = history?.headToHead.length ?? 0;
  const canLoadHistory = Boolean(versusHistoryMatch(activeSet));
  const mode = versusPresentationMode(activeSet);
  const historyControls = mode !== 'waiting' && (
    <Stack gap="xs">
      <Text fw={800}>{t('workspaces.versusScreen.startgg')}</Text>
      <Button fullWidth loading={refreshing} disabled={!canLoadHistory || saving} onClick={() => void refreshHistory()}>
        {t('workspaces.versusScreen.refreshHistory')}
      </Button>
      <Text c="dimmed" size="sm">
        {!canLoadHistory
          ? t('workspaces.versusScreen.startggProfileError')
          : historyState.historyLoading
            ? t('workspaces.versusScreen.historyLoading')
            : historyState.historyError
              ? t('workspaces.versusScreen.historyFailed')
              : `${historyCount} ${t('workspaces.versusScreen.historyEntries')}`}
      </Text>
    </Stack>
  );
  return (
    <Stack gap="md">
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
        <Select
          label={t('workspaces.styling')}
          data={sortedProfiles.map((profile) => ({ value: profile.id, label: profile.styleName }))}
          value={state.stylingGameId}
          searchable
          allowDeselect={false}
          disabled={saving || refreshing}
          onChange={(value) => value && void update({ stylingGameId: value as GameId })}
        />
        <OverlayLogoSelect
          logos={logos}
          assetId={state.logoAssetId}
          disabled={saving || refreshing}
          onChange={(logoAssetId) => void update({ logoAssetId })}
        />
      </SimpleGrid>
      {mode === 'waiting' && (
        <Text c="dimmed" size="sm">
          {t('workspaces.tools.versus.next')}
        </Text>
      )}
      {activeSet && mode !== 'waiting' && characterCatalog && onPatch && (
        <VersusCharacterControls activeSet={activeSet} catalog={characterCatalog} onPatch={onPatch} />
      )}
      <div>
        <Text fw={700} size="sm" mb={6}>
          {t('thumbnail.mediaMode')}
        </Text>
        <SegmentedControl
          fullWidth
          value={state.mediaMode}
          data={playerMediaModeIds.map((value) => ({ value, label: t(`thumbnail.mediaModes.${value}`) }))}
          disabled={saving || refreshing}
          onChange={(mediaMode) => void update({ mediaMode: mediaMode as PlayerMediaMode })}
        />
      </div>
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
        <Switch
          label={t('workspaces.transparentBackground')}
          checked={!state.showBackground}
          disabled={saving || refreshing}
          onChange={(event) => void update({ showBackground: !event.currentTarget.checked })}
        />
        <Switch
          label={t('thumbnail.showTournamentLogo')}
          description={t('broadcast.sharedLogoHelp')}
          checked={state.showTournamentLogo}
          disabled={saving || refreshing}
          onChange={(event) => void update({ showTournamentLogo: event.currentTarget.checked })}
        />
        <Switch
          label={t('workspaces.versusScreen.showMatchBackdrop')}
          description={t('workspaces.versusScreen.matchBackdropHelp')}
          checked={state.showMatchBackdrop}
          disabled={saving || refreshing}
          onChange={(event) => void update({ showMatchBackdrop: event.currentTarget.checked })}
        />
        <Switch
          label={t('thumbnail.showSponsorLogo')}
          description={t('broadcast.sponsorLogoHelp')}
          checked={state.showSponsorLogos}
          disabled={saving || refreshing}
          onChange={(event) => void update({ showSponsorLogos: event.currentTarget.checked })}
        />
        <Switch
          label={t('workspaces.versusScreen.showHeadToHead')}
          checked={state.showHeadToHead}
          disabled={saving || refreshing}
          onChange={(event) => void update({ showHeadToHead: event.currentTarget.checked })}
        />
      </SimpleGrid>
      {activeSet && mode !== 'waiting' && (
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Text fw={800} flex={1} miw={0}>
              {t('workspaces.versusScreen.livePreview')}
            </Text>
            <Badge color={saving || pendingChanges ? 'yellow' : 'green'} variant="light" style={{ flexShrink: 0 }}>
              {saving || pendingChanges
                ? t('workspaces.versusScreen.obsPending')
                : t('workspaces.versusScreen.obsCurrent')}
            </Badge>
          </Group>
          {placementOptions.length > 0 && (
            <>
              <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }}>
                <Select
                  label={t('thumbnail.adjustLayer')}
                  value={selectedLayer ? `${selectedLayer.player}:${selectedLayer.layer}` : null}
                  placeholder={t('actions.select')}
                  clearable
                  data={placementOptions}
                  onChange={(value) => {
                    if (!value) return setSelectedLayer(undefined);
                    const [player, layer] = value.split(':');
                    setSelectedLayer({ player: Number(player) as 0 | 1, layer: layer as MediaLayerKind });
                  }}
                />
                <Group align="flex-end">
                  <Button
                    fullWidth
                    variant="default"
                    disabled={!selectedLayer}
                    onClick={() =>
                      selectedLayer &&
                      updatePlacement(selectedLayer.player, selectedLayer.layer, defaultMediaTransform())
                    }
                  >
                    {t('topEight.resetPlacement')}
                  </Button>
                </Group>
              </SimpleGrid>
              <MediaControlHint showOverlapSelection />
            </>
          )}
          <VersusPreview
            activeSet={activeSet}
            settings={state}
            selectedLayer={selectedLayer}
            onSelectLayer={(player, layer) => setSelectedLayer({ player, layer })}
            onPlacementChange={updatePlacement}
          />
        </Stack>
      )}
      <VersusStatControls
        settings={state}
        showSeed={mode === 'tournament'}
        disabled={saving || refreshing}
        onChange={(patch) => void update(patch)}
      />
      {sourceLinks}
      {historyControls}
    </Stack>
  );
}

export function VersusScreenStatus({ activeSet }: { activeSet?: SelectedSetState }) {
  const { t } = useTranslation('operator');
  if (!activeSet || versusPresentationMode(activeSet) === 'waiting') {
    return (
      <Badge color="gray" maw="100%" h="auto" styles={{ label: { whiteSpace: 'normal' } }}>
        {t('workspaces.versusScreen.noSet')}
      </Badge>
    );
  }
  return (
    <Text fw={900} miw={0} style={{ overflowWrap: 'anywhere' }}>
      {activeSet.playerOne.name}{' '}
      <Text component="span" c="dimmed">
        vs
      </Text>{' '}
      {activeSet.playerTwo.name}
    </Text>
  );
}

function notify(error: unknown) {
  notifications.show({
    color: 'red',
    title: 'Versus Screen unavailable',
    message: error instanceof Error ? error.message : 'JABS could not update the Versus Screen.'
  });
}
