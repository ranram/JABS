import './bracketPreview.css';
import { useBracketLabel } from '../appearance/AppearanceProvider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import type { LogoAsset, StartggPhase, StartggPhaseGroup } from '@shared/models';
import type { BracketSettings } from '@shared/bracketScreen';
import { displayPhaseName } from '@shared/matchContext';
import { api } from '../../api';
import { useBracketScreenState } from '../../hooks/useBracketScreenState';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { BracketPresentation } from '../BracketScreen';
import { bracketRounds } from '../bracketLayout';
import { OverlayLogoSelect } from './OverlayLogoSelect';
import { sortByLabel } from './operatorUtils';

export function BracketScreenControls({
  eventId,
  phases,
  profiles,
  logos
}: {
  eventId?: string;
  phases: StartggPhase[];
  profiles: GameProfile[];
  logos: LogoAsset[];
}) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const winnersLabel = useBracketLabel('winners');
  const losersLabel = useBracketLabel('losers');
  const { state: live } = useBracketScreenState();
  const settings = useSettingsDraft({
    load: async () => (await api.bracketScreenState()).settings,
    save: async (value: BracketSettings) => (await api.updateBracketScreenSettings(value)).settings,
    onError: notifyError
  });
  const [phaseId, setPhaseId] = useState<string>();
  const [groups, setGroups] = useState<StartggPhaseGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scope = settings.state?.scope;
  const currentPhase = phaseId ?? (scope && scope.eventId === eventId ? scope.phaseId : undefined);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const phaseOptions = useMemo(
    () =>
      sortByLabel(phases, (phase) => displayPhaseName(phase.name), locale).map(({ id, name }) => ({
        value: id,
        label: displayPhaseName(name)
      })),
    [phases, locale]
  );
  const shell = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    setPhaseId(undefined);
    setGroups([]);
    // This selector is independent of set browsing; opening it never fetches an entire event.
    if (settings.state?.scope && settings.state.scope.eventId !== eventId) void settings.reload();
  }, [eventId]);
  useEffect(() => {
    if (!currentPhase && phases.length === 1) setPhaseId(phases[0].id);
  }, [phases, currentPhase]);
  useEffect(() => {
    let active = true;
    setGroups([]);
    if (!currentPhase || !eventId) {
      setGroupsLoading(false);
      return;
    }
    setGroupsLoading(true);
    void (async () => {
      try {
        const first = await api.phaseGroups(currentPhase, 1, 100);
        const byId = new Map(first.phaseGroups.map((group) => [group.id, group]));
        // Only pool identifiers are loaded here, never sets from the other pools.
        for (let page = 2; page <= first.pageInfo.totalPages; page++) {
          if (!active) return;
          const next = await api.phaseGroups(currentPhase, page, 100);
          next.phaseGroups.forEach((group) => byId.set(group.id, group));
        }
        if (!active) return;
        const loaded = [...byId.values()];
        setGroups(loaded);
        if (loaded.length === 1 && settings.state?.scope?.phaseGroupId !== loaded[0].id) {
          void settings.update({
            scope: { eventId, phaseId: currentPhase, phaseGroupId: loaded[0].id },
            winnersRound: undefined,
            losersRound: undefined
          });
        }
      } catch (error) {
        if (active) notifyError(error);
      } finally {
        if (active) setGroupsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentPhase, eventId, Boolean(settings.state)]);
  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    const measure = () => setScale(node.clientWidth / 1920);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [Boolean(live)]);

  if (!settings.state)
    return (
      <Text size="sm" c="dimmed">
        {t('bracketScreen.loading')}
      </Text>
    );
  const state = settings.state;
  async function refresh() {
    setRefreshing(true);
    try {
      await api.refreshBracketScreen();
    } catch (error) {
      notifyError(error);
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label={t('browser.phase')}
          searchable
          clearable
          data={phaseOptions}
          value={currentPhase ?? null}
          disabled={!eventId || settings.saving}
          onChange={(value) => {
            setPhaseId(value ?? '');
            setGroups([]);
            void settings.update({ scope: undefined, winnersRound: undefined, losersRound: undefined });
          }}
        />
        <Select
          label={t('browser.pool')}
          searchable
          clearable
          data={sortByLabel(groups, (group) => group.displayIdentifier, locale).map(({ id, displayIdentifier }) => ({
            value: id,
            label: displayIdentifier
          }))}
          value={scope && scope.eventId === eventId && scope.phaseId === currentPhase ? scope.phaseGroupId : null}
          disabled={!currentPhase || groupsLoading || settings.saving}
          onChange={(value) => {
            void settings.update({
              scope:
                value && eventId && currentPhase ? { eventId, phaseId: currentPhase, phaseGroupId: value } : undefined,
              winnersRound: undefined,
              losersRound: undefined
            });
          }}
        />
      </SimpleGrid>
      {groupsLoading && (
        <Text size="sm" c="dimmed">
          {t('bracketScreen.loadingPools')}
        </Text>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label={t('bracketScreen.headingLabel')}
          placeholder={t('bracketScreen.title')}
          value={state.heading ?? ''}
          maxLength={100}
          onChange={(event) => void settings.update({ heading: event.currentTarget.value || undefined }, 350)}
        />
        <TextInput
          label={t('bracketScreen.eventLabel')}
          placeholder={live?.snapshot?.eventName ?? ''}
          value={state.eventLabel ?? ''}
          maxLength={100}
          onChange={(event) => void settings.update({ eventLabel: event.currentTarget.value || undefined }, 350)}
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label={t('workspaces.styling')}
          searchable
          value={state.stylingGameId}
          data={sortByLabel(profiles, (profile) => profile.styleName, locale).map((profile) => ({
            value: profile.id,
            label: profile.styleName
          }))}
          onChange={(value) => value && void settings.update({ stylingGameId: value as GameId })}
        />
        <OverlayLogoSelect
          logos={logos}
          assetId={state.logoAssetId}
          onChange={(logoAssetId) => void settings.update({ logoAssetId })}
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Switch
          label={t('workspaces.transparentBackground')}
          checked={!state.showBackground}
          onChange={(event) => void settings.update({ showBackground: !event.currentTarget.checked })}
        />
        <Switch
          label={t('workspaces.resultScreen.showTournamentLogo')}
          checked={state.showTournamentLogo}
          onChange={(event) => void settings.update({ showTournamentLogo: event.currentTarget.checked })}
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label={t('appearance.startingRound', { bracket: winnersLabel })}
          placeholder={t('bracketScreen.autoRounds')}
          clearable
          value={state.winnersRound === undefined ? null : String(state.winnersRound)}
          data={bracketRounds(live?.snapshot?.matches ?? [], false).map(({ roundNumber, title }) => ({
            value: String(roundNumber),
            label: title
          }))}
          onChange={(value) => void settings.update({ winnersRound: value ? Number(value) : undefined })}
        />
        <Select
          label={t('appearance.startingRound', { bracket: losersLabel })}
          placeholder={t('bracketScreen.autoRounds')}
          clearable
          value={state.losersRound === undefined ? null : String(state.losersRound)}
          data={bracketRounds(live?.snapshot?.matches ?? [], true).map(({ roundNumber, title }) => ({
            value: String(roundNumber),
            label: title
          }))}
          onChange={(value) => void settings.update({ losersRound: value ? Number(value) : undefined })}
        />
      </SimpleGrid>

      <Button
        variant="default"
        loading={refreshing}
        disabled={!state.scope || settings.saving}
        onClick={() => void refresh()}
      >
        {t('bracketScreen.refresh')}
      </Button>
      {live?.error && (
        <Text c="red" size="sm">
          {live.error}
        </Text>
      )}
      {live && (
        <div ref={shell} className={`bracket-preview-shell${state.showBackground ? '' : ' is-transparent-preview'}`}>
          <div className="bracket-preview-stage" style={{ transform: `scale(${scale})` }}>
            <BracketPresentation state={{ ...live, settings: state }} preview />
          </div>
        </div>
      )}
      <Text size="sm" c="dimmed">
        {t('bracketScreen.refreshHelp')}
      </Text>
    </Stack>
  );
  function notifyError(error: unknown) {
    notifications.show({
      title: t('bracketScreen.failed'),
      message: error instanceof Error ? error.message : t('bracketScreen.failed'),
      color: 'red'
    });
  }
}
