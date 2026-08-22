import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Code, Group, SegmentedControl, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';
import { clampMediaTransform, defaultMediaTransform, type MediaLayerKind, type MediaTransform } from '@shared/mediaPlacement';
import type { VersusScreenState } from '@shared/versusScreen';
import { api } from '../../api';
import { VersusPreview } from './VersusPreview';
import { useTranslation } from 'react-i18next';
import { sortByLabel } from './operatorUtils';
import { MediaFoldersAccordion } from './MediaFoldersAccordion';

type VersusScreenControlsProps = {
  activeSet?: SelectedSetState;
  localBaseUrl?: string;
  profiles: GameProfile[];
  assetCatalogSlug?: string;
};

export function VersusScreenControls({ activeSet, localBaseUrl, profiles, assetCatalogSlug }: VersusScreenControlsProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const [state, setState] = useState<VersusScreenState>();
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<{ player: 0 | 1; layer: MediaLayerKind }>();
  const [placementPending, setPlacementPending] = useState(false);
  const stateRef = useRef<VersusScreenState | undefined>(undefined);
  const placementTimerRef = useRef<number | undefined>(undefined);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(() => sortByLabel(profiles, (profile) => profile.styleName, locale), [profiles, locale]);
  stateRef.current = state;
  useEffect(() => {
    void api.versusScreenState().then(setState).catch((error) => notify(error));
  }, []);

  async function update(patch: Partial<VersusScreenState>) {
    const current = stateRef.current;
    if (!current) return;
    if (placementTimerRef.current) window.clearTimeout(placementTimerRef.current);
    setPlacementPending(false);
    const next = { ...current, ...patch };
    setState(next);
    stateRef.current = next;
    setSaving(true);
    try {
      const saved = await api.updateVersusScreenState(next);
      setState(saved);
      stateRef.current = saved;
    } catch (error) {
      notify(error);
    } finally {
      setSaving(false);
    }
  }

  function updatePlacement(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform) {
    const current = stateRef.current;
    if (!current) return;
    const placements = [...current.mediaPlacements] as VersusScreenState['mediaPlacements'];
    placements[player] = { ...placements[player], [layer]: clampMediaTransform(transform) };
    const next = { ...current, mediaPlacements: placements };
    stateRef.current = next;
    setState(next);
    setPlacementPending(true);
    if (placementTimerRef.current) window.clearTimeout(placementTimerRef.current);
    placementTimerRef.current = window.setTimeout(() => void update({ mediaPlacements: next.mediaPlacements }), 1_000);
  }

  const placementOptions = useMemo(() => {
    if (!activeSet || !state) return [];
    const layer = state.mediaMode;
    return [activeSet.playerOne.name, activeSet.playerTwo.name].map((name, player) => ({
      value: `${player}:${layer}`,
      label: `${name} · ${layer === 'character' ? 'Character art' : 'Player photo'}`
    }));
  }, [activeSet, state?.mediaMode]);

  async function refreshHistory() {
    setRefreshing(true);
    try {
      const next = await api.refreshVersusHistory();
      setState(next);
      notifications.show({ color: 'green', title: 'Versus history updated', message: 'Latest placements and head-to-head sets were loaded from start.gg.' });
    } catch (error) {
      notify(error);
    } finally {
      setRefreshing(false);
    }
  }

  if (!state) return <Text c="dimmed" size="sm">Loading Versus Screen settings…</Text>;
  const historyCount = (state.history?.playerOnePlacements.length ?? 0)
    + (state.history?.playerTwoPlacements.length ?? 0)
    + (state.history?.headToHead.length ?? 0);
  const canLoadHistory = Boolean(activeSet?.eventId && activeSet.playerOne.playerId && activeSet.playerTwo.playerId);
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Text fw={800}>{t('workspaces.versusScreen.currentMatchup')}</Text>
        {activeSet ? (
          <Text fw={900}>{activeSet.playerOne.name} <Text component="span" c="dimmed">vs</Text> {activeSet.playerTwo.name}</Text>
        ) : <Badge color="gray">No set on stream</Badge>}
      </Group>
      <Group justify="space-between" align="center" wrap="wrap">
        <div>
          <Text fw={800}>{t('workspaces.versusScreen.startgg')}</Text>
          <Text c="dimmed" size="sm">
            {canLoadHistory ? `${historyCount} ${t('workspaces.versusScreen.historyEntries')}` : t('workspaces.versusScreen.startggProfileError')}
          </Text>
        <Button loading={refreshing} disabled={!canLoadHistory} onClick={() => void refreshHistory()}>
          {t('workspaces.versusScreen.refreshHistory')}
        </Button>
        </div>
      </Group>
      {activeSet && (
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={800}>{t('workspaces.versusScreen.livePreview')}</Text>
            <Badge color={placementPending ? 'yellow' : 'green'} variant="light">
              {placementPending ? t('workspaces.versusScreen.obsPending') : t('workspaces.versusScreen.obsCurrent')}
            </Badge>
          </Group>
          <SimpleGrid type="container" cols={{ base: 1, '34rem': 2 }}>
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
                onClick={() => selectedLayer && updatePlacement(selectedLayer.player, selectedLayer.layer, defaultMediaTransform())}
              >
                {t('topEight.resetPlacement')}
              </Button>
            </Group>
          </SimpleGrid>
          <Text c="dimmed" size="xs">{t('topEight.adjustHint')}</Text>
          <VersusPreview
            activeSet={activeSet}
            settings={state}
            selectedLayer={selectedLayer}
            onSelectLayer={(player, layer) => setSelectedLayer({ player, layer })}
            onPlacementChange={updatePlacement}
          />
        </Stack>
      )}
      <Select
        label="Styling"
        data={sortedProfiles.map((profile) => ({ value: profile.id, label: profile.styleName }))}
        value={state.stylingGameId}
        searchable
        allowDeselect={false}
        disabled={saving}
        onChange={(value) => value && void update({ stylingGameId: value as GameId })}
      />
      <div>
        <Text fw={700} size="sm" mb={6}>{t('thumbnail.mediaMode')}</Text>
        <SegmentedControl
          fullWidth
          value={state.mediaMode}
          data={[{ value: 'character', label: t('thumbnail.mediaModes.character') }, { value: 'photo', label: t('thumbnail.mediaModes.photo') }]}
          disabled={saving}
          onChange={(mediaMode) => void update({ mediaMode: mediaMode as 'character' | 'photo' })}
        />
      </div>
      <Group grow align="center">
        <Switch label={t('thumbnail.showTournamentLogo')} checked={state.showTournamentLogo} disabled={saving} onChange={(event) => void update({ showTournamentLogo: event.currentTarget.checked })} />
        <Switch label={t('thumbnail.showSponsorLogo')} checked={state.showSponsorLogos} disabled={saving} onChange={(event) => void update({ showSponsorLogos: event.currentTarget.checked })} />
      </Group>
      <MediaFoldersAccordion gameAssetSubpath={assetCatalogSlug ? `${assetCatalogSlug}/characters` : undefined} />
      {localBaseUrl && <Code className="workspace-obs-url" block>{localBaseUrl}/overlay/active/versus</Code>}
    </Stack>
  );
}

function notify(error: unknown) {
  notifications.show({
    color: 'red',
    title: 'Versus Screen unavailable',
    message: error instanceof Error ? error.message : 'JABS could not update the Versus Screen.'
  });
}
