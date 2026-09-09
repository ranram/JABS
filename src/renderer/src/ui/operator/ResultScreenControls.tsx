import { useEffect, useMemo, useState } from 'react';
import { Badge, Group, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { sortByLabel } from './operatorUtils';
import { MediaFoldersAccordion } from './MediaFoldersAccordion';
import type { ResultScreenState } from '@shared/resultScreen';
import type { LogoAsset, SelectedSetState } from '@shared/models';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import { api } from '../../api';
import { announcementPresentation } from '../announcementPresentation';

type ResultScreenControlsProps = {
  activeSet?: SelectedSetState;
  logos: LogoAsset[];
  profiles: GameProfile[];
  assetCatalogSlug?: string;
};

type AssetAvailability = Record<'tournamentLogo' | 'playerPhoto' | 'sponsorLogo' | 'character', boolean>;
const emptyAvailability: AssetAvailability = {
  tournamentLogo: false,
  playerPhoto: false,
  sponsorLogo: false,
  character: false
};

export function ResultScreenControls({ activeSet, logos, profiles, assetCatalogSlug }: ResultScreenControlsProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const [state, setState] = useState<ResultScreenState>();
  const [availability, setAvailability] = useState<AssetAvailability>(emptyAvailability);
  const [saving, setSaving] = useState<keyof ResultScreenState>();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(() => sortByLabel(profiles, (profile) => profile.styleName, locale), [profiles, locale]);

  useEffect(() => {
    void api.resultScreenState().then(setState).catch((error) => notifyError(
      error,
      t('workspaces.resultScreen.failedTitle'),
      t('workspaces.resultScreen.failed')
    ));
  }, [t]);

  useEffect(() => {
    let active = true;
    const presentation = activeSet ? announcementPresentation(activeSet) : undefined;
    const winner = presentation?.winner;
    const tournamentLogo = Boolean(
      logos.some((logo) => logo.id === activeSet?.broadcast?.logoAssetId)
      || logos.length > 0
    );
    if (!activeSet || !winner) {
      setAvailability({ ...emptyAvailability, tournamentLogo });
      return () => { active = false; };
    }
    void api.playerMedia().then((media) => {
      if (!active) return;
      const winnerMedia = winner.entrantId === activeSet.playerOne.entrantId
        ? media.playerOne
        : media.playerTwo;
      setAvailability({
        tournamentLogo,
        playerPhoto: Boolean(winnerMedia.playerPhotoAssetId),
        sponsorLogo: Boolean(winnerMedia.sponsorLogoAssetId),
        character: Boolean(winner.character)
      });
    }).catch(() => {
      if (active) setAvailability({ ...emptyAvailability, tournamentLogo });
    });
    return () => { active = false; };
  }, [activeSet, logos]);

  async function update(
    key: keyof Omit<ResultScreenState, 'updatedAt'>,
    value: boolean | GameId
  ) {
    if (!state) return;
    setSaving(key);
    try {
      const next = await api.updateResultScreenState({ ...state, [key]: value });
      setState(next);
    } catch (error) {
      notifyError(
        error,
        t('workspaces.resultScreen.failedTitle'),
        t('workspaces.resultScreen.failed')
      );
    } finally {
      setSaving(undefined);
    }
  }

  if (!state) return <Text c="dimmed" size="sm">{t('workspaces.resultScreen.loading')}</Text>;
  const currentResult = activeSet ? announcementPresentation(activeSet) : undefined;
  const controls = [
    ['showTournamentLogo', 'tournamentLogo'],
    ['showPlayerPhoto', 'playerPhoto'],
    ['showSponsorLogo', 'sponsorLogo'],
    ['showCharacter', 'character']
  ] as const;
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Text fw={800}>{t('workspaces.resultScreen.currentWinner')}</Text>
        {currentResult ? (
          <Group gap="xs">
            <Badge color={currentResult.kind === 'champion' ? 'yellow' : 'green'} variant="light">
              {t(`workspaces.resultScreen.${currentResult.kind}`)}
            </Badge>
            <Text fw={900}>{currentResult.winner.name}</Text>
          </Group>
        ) : (
          <Badge color="gray" variant="light">{t('workspaces.resultScreen.noWinner')}</Badge>
        )}
      </Group>
      <Select
        label={t('workspaces.styling')}
        searchable
        value={state.stylingGameId}
        data={sortedProfiles.map((profile) => ({ value: profile.id, label: profile.styleName }))}
        disabled={saving !== undefined}
        onChange={(value) => value && void update('stylingGameId', value as GameId)}
      />
      <SimpleGrid type="container" cols={{ base: 1, '32rem': 2 }}>
        <Switch
          checked={!state.showBackground}
          disabled={saving !== undefined}
          label={t('workspaces.transparentBackground')}
          description={t('workspaces.transparentBackgroundHelp')}
          onChange={(event) => void update('showBackground', !event.currentTarget.checked)}
        />
        {controls.map(([setting, asset]) => (
          <Switch
            key={setting}
            checked={state[setting]}
            disabled={saving !== undefined}
            label={t(`workspaces.resultScreen.${setting}`)}
            description={t(availability[asset]
              ? 'workspaces.resultScreen.availableForWinner'
              : 'workspaces.resultScreen.unavailableForWinner')}
            onChange={(event) => void update(setting, event.currentTarget.checked)}
          />
        ))}
      </SimpleGrid>
      <MediaFoldersAccordion gameAssetSubpath={assetCatalogSlug ? `${assetCatalogSlug}/characters` : undefined} />
    </Stack>
  );
}

function notifyError(error: unknown, title: string, fallback: string) {
  notifications.show({
    title,
    message: error instanceof Error ? error.message : fallback,
    color: 'red',
    autoClose: false
  });
}
