import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { GameProfile } from '@shared/gameProfiles';
import type { GameCharacterAsset, LogoAsset, SetSummary, StartggPhase, StartggSetScope } from '@shared/models';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import {
  detectExplicitTopEightOpeningSets,
  detectTopEightOpeningSets,
  type TopEightMatchupsState
} from '@shared/topEightMatchups';
import { api } from '../../api';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { BufferedTextInput } from './BufferedTextInput';
import { TopEightMatchupPlayerEditor } from './TopEightMatchupPlayerEditor';
import { TopEightMatchupsPreview } from './TopEightMatchupsPreview';

export function TopEightMatchupsControls({
  profiles,
  logos,
  selectedEventId,
  selectedEventName,
  phases,
  assetCatalogSlug,
  assetCatalogRevision
}: {
  assetCatalogRevision: number;
  profiles: GameProfile[];
  logos: LogoAsset[];
  selectedEventId?: string;
  selectedEventName?: string;
  phases: StartggPhase[];
  assetCatalogSlug?: string;
}) {
  const { t } = useTranslation(['operator', 'common']);
  const catalogRevision = useCatalogRevision();
  const {
    state,
    update,
    loadError,
    reload: loadState
  } = useSettingsDraft({
    load: api.topEightMatchupsState,
    save: api.updateTopEightMatchupsState,
    onError: showError
  });
  const [assets, setAssets] = useState<GameCharacterAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>();
  const appliedCatalog = useRef<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    if (!state?.assetCatalogSlug) {
      setAssets([]);
      return;
    }
    setAssets([]);
    void api
      .gameCharacterAssets(state.assetCatalogSlug)
      .then(({ assets }) => {
        if (!cancelled) setAssets(assets);
      })
      .catch((error) => {
        if (!cancelled) showError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [state?.assetCatalogSlug, assetCatalogRevision, catalogRevision]);
  useEffect(() => {
    if (!state || !assetCatalogSlug || appliedCatalog.current === assetCatalogSlug) return;
    appliedCatalog.current = assetCatalogSlug;
    if (state.assetCatalogSlug === assetCatalogSlug) return;
    const stylingGameId = profiles.some(({ id }) => id === assetCatalogSlug)
      ? (assetCatalogSlug as typeof state.stylingGameId)
      : state.stylingGameId;
    void update({ assetCatalogSlug, stylingGameId });
  }, [assetCatalogSlug, state?.assetCatalogSlug]);
  const characters = useMemo(
    () =>
      [
        ...new Set([
          ...charactersForAssetCatalog(state?.assetCatalogSlug ?? ''),
          ...assets.map(({ character }) => character)
        ])
      ].sort(),
    [assets, state?.assetCatalogSlug]
  );
  function updatePlayer(index: number, patch: Partial<TopEightMatchupsState['matchups'][number]['players'][number]>) {
    void update((current) => ({
      ...current,
      matchups: current.matchups.map((matchup, matchupIndex) =>
        matchupIndex !== Math.floor(index / 2)
          ? matchup
          : {
              ...matchup,
              players: matchup.players.map((player, playerIndex) =>
                playerIndex === index % 2 ? { ...player, ...patch } : player
              ) as typeof matchup.players
            }
      )
    }));
  }
  async function detect() {
    if (!selectedEventId || !state) return;
    const topEightPhase = phases.find(({ name }) => isTopEightPhaseName(name));
    const scope: StartggSetScope = topEightPhase
      ? { type: 'phase', eventId: selectedEventId, phaseId: topEightPhase.id }
      : { type: 'event', eventId: selectedEventId };
    setLoading(true);
    setProgress(
      topEightPhase
        ? t('operator:topEightMatchups.explicitPhase', {
            phase: topEightPhase.name
          })
        : t('operator:topEightMatchups.topologyFallback')
    );
    try {
      const first = await api.sets(scope, 1, 50);
      const sets: SetSummary[] = [...first.sets];
      const pages = first.pageInfo.totalPages;
      if (pages > 200) throw new Error(t('operator:topEightMatchups.tooLarge'));
      for (let start = 2; start <= pages; start += 4) {
        const pageNumbers = Array.from({ length: Math.min(4, pages - start + 1) }, (_, index) => start + index);
        setProgress(
          t('operator:topEightMatchups.pages', {
            start,
            end: Math.min(start + 3, pages),
            total: pages
          })
        );
        const results = await Promise.all(pageNumbers.map((page) => api.sets(scope, page, 50)));
        sets.push(...results.flatMap((result) => result.sets));
      }
      setProgress(
        topEightPhase
          ? t('operator:topEightMatchups.analyzePhase', {
              phase: topEightPhase.name
            })
          : t('operator:topEightMatchups.analyzeEvent', { count: sets.length })
      );
      const opening = topEightPhase ? detectExplicitTopEightOpeningSets(sets) : detectTopEightOpeningSets(sets);
      if (!opening) throw new Error(t('operator:topEightMatchups.notDetected'));
      const imported = opening.map(importedMatchup);
      const preferences = await api.resolvePlayers(
        imported.flatMap((matchup) => matchup.players.map(({ playerId }) => ({ playerId }))),
        assetCatalogSlug ?? state.assetCatalogSlug
      );
      imported.forEach((matchup, index) =>
        matchup.players.forEach((player, side) => {
          const saved = preferences[index * 2 + side];
          if (saved)
            Object.assign(player, {
              localPlayerId: saved.localPlayerId,
              character: saved.character ?? undefined,
              characterAssetId: saved.characterAssetId ?? undefined,
              portraitAssetId: saved.portraitAssetId ?? undefined
            });
        })
      );
      const saved = await update({
        assetCatalogSlug: assetCatalogSlug ?? state.assetCatalogSlug,
        eventName: selectedEventName ?? state.eventName,
        matchups: imported
      });
      if (saved) {
        notifications.show({
          color: 'green',
          title: t('operator:topEightMatchups.title'),
          message: t('operator:topEightMatchups.detected')
        });
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
      setProgress(undefined);
    }
  }
  if (!state)
    return (
      <Stack gap="sm">
        <Text c={loadError ? 'red' : 'dimmed'}>
          {loadError ? failureText(loadError) : t('operator:topEightMatchups.loading')}
        </Text>
        {Boolean(loadError) && (
          <Button variant="default" onClick={() => void loadState()}>
            {t('operator:topEightMatchups.retry')}
          </Button>
        )}
      </Stack>
    );
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label={t('operator:workspaces.styling')}
          value={state.stylingGameId}
          data={profiles.map((profile) => ({
            value: profile.id,
            label: profile.styleName
          }))}
          onChange={(value) => value && void update({ stylingGameId: value as typeof state.stylingGameId })}
        />
        <BufferedTextInput
          label={t('operator:topEight.tournament')}
          value={state.tournamentName}
          onCommit={(tournamentName) => void update({ tournamentName })}
        />
        <BufferedTextInput
          label={t('operator:topEightMatchups.eventName')}
          value={state.eventName ?? ''}
          onCommit={(eventName) => void update({ eventName: eventName || undefined })}
        />
        <Select
          searchable
          clearable
          label={t('operator:topEight.tournamentLogo')}
          placeholder={t('operator:broadcast.useRailsLogo')}
          value={state.logoAssetId ?? null}
          data={logos.map((logo) => ({ value: logo.id, label: logo.label }))}
          onChange={(logoAssetId) => void update({ logoAssetId: logoAssetId || undefined })}
        />
      </SimpleGrid>
      <SimpleGrid type="container" cols={{ base: 1, '48rem': 3 }} w="100%" maw={1080} spacing="md">
        <Switch
          label={t('operator:workspaces.transparentBackground')}
          checked={!state.showBackground}
          onChange={(event) => void update({ showBackground: !event.currentTarget.checked })}
        />
        <Switch
          label={t('operator:thumbnail.showTournamentLogo')}
          description={t('operator:broadcast.sharedLogoHelp')}
          checked={state.showTournamentLogo}
          onChange={(event) => void update({ showTournamentLogo: event.currentTarget.checked })}
        />
        <Switch
          label={t('operator:topEightMatchups.flipPlayerTwo')}
          checked={state.flipPlayerTwoPortraits}
          onChange={(event) => void update({ flipPlayerTwoPortraits: event.currentTarget.checked })}
        />
      </SimpleGrid>
      <Button loading={loading} disabled={!selectedEventId} onClick={() => void detect()}>
        {t('operator:topEightMatchups.detect')}
      </Button>
      {progress && (
        <Text role="status" c="dimmed" size="sm">
          {progress}
        </Text>
      )}
      <TopEightMatchupsPreview state={state} />
      <SimpleGrid type="container" cols={{ base: 1, '40rem': 2, '72rem': 4 }}>
        {state.matchups.flatMap((matchup, matchupIndex) =>
          matchup.players.map((player, playerIndex) => (
            <TopEightMatchupPlayerEditor
              key={matchupIndex * 2 + playerIndex}
              player={player}
              bracket={matchup.bracket}
              matchNumber={(matchupIndex % 2) + 1}
              playerNumber={playerIndex + 1}
              characters={characters}
              assets={assets}
              onChange={(patch) => updatePlayer(matchupIndex * 2 + playerIndex, patch)}
            />
          ))
        )}
      </SimpleGrid>
    </Stack>
  );

  function showError(error: unknown) {
    notifications.show({
      color: 'red',
      title: t('operator:topEightMatchups.title'),
      message: failureText(error)
    });
  }

  function failureText(error: unknown): string {
    return error instanceof Error && error.message ? error.message : t('operator:topEightMatchups.unavailable');
  }
}

function isTopEightPhaseName(name: string): boolean {
  return /(^|\s)top\s*8($|\s)/iu.test(name.normalize('NFKC').replace(/[_-]+/gu, ' ').trim());
}

function importedMatchup(set: SetSummary, index: number): TopEightMatchupsState['matchups'][number] {
  const player = (entrant: SetSummary['entrantOne'], side: number) => ({
    entrantId: entrant?.id,
    playerId: entrant?.playerId ?? undefined,
    name: entrant?.name ?? `Player ${index * 2 + side + 1}`,
    sponsor: entrant?.sponsor
  });
  return {
    setId: set.id,
    bracket: index < 2 ? 'winners' : 'losers',
    players: [player(set.entrantOne, 0), player(set.entrantTwo, 1)]
  };
}
