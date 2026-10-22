import { useEffect, useMemo, useState } from 'react';
import { Badge, Group, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { sortByLabel } from './operatorUtils';
import { OverlayLogoSelect } from './OverlayLogoSelect';
import type { ResultScreenState } from '@shared/resultScreen';
import type { GameCharacterAsset, LogoAsset, OverlayMediaMatches, SelectedSetState } from '@shared/models';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import { playerPortraitCharacters } from '@shared/characterTeams';
import { api } from '../../api';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { announcementPresentation } from '../announcementPresentation';

type ResultScreenControlsProps = {
  activeSet?: SelectedSetState;
  logos: LogoAsset[];
  profiles: GameProfile[];
};

export function ResultScreenControls({ activeSet, logos, profiles }: ResultScreenControlsProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const [state, setState] = useState<ResultScreenState>();
  const [playerMedia, setPlayerMedia] = useState<{ key: string; matches: OverlayMediaMatches }>();
  const [characterCatalog, setCharacterCatalog] = useState<{ slug: string; assets: GameCharacterAsset[] }>();
  const catalogRevision = useCatalogRevision();
  const [saving, setSaving] = useState(false);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.styleName, locale),
    [profiles, locale]
  );
  const selectedLogo = state?.logoAssetId ?? activeSet?.broadcast?.logoAssetId;
  const logoAvailable = logos.some(({ id }) => id === selectedLogo);
  const currentResult = activeSet ? announcementPresentation(activeSet) : undefined;
  const winner = currentResult?.winner;
  // Scores and styling do not change which files match these players.
  const identityKey =
    activeSet && winner
      ? JSON.stringify([
          activeSet.setId,
          activeSet.eventId,
          activeSet.playerOne.name,
          activeSet.playerOne.prefix,
          activeSet.playerOne.sponsor,
          activeSet.playerTwo.name,
          activeSet.playerTwo.prefix,
          activeSet.playerTwo.sponsor
        ])
      : undefined;
  const gameSlug = winner && activeSet ? (activeSet.assetCatalogSlug ?? activeSet.gameId) : undefined;
  // Manual players may share empty entrant IDs. Use the player identified by the result.
  const winnerMedia =
    identityKey && playerMedia?.key === identityKey && activeSet
      ? winner === activeSet.playerOne
        ? playerMedia.matches.playerOne
        : playerMedia.matches.playerTwo
      : undefined;
  const characterAssets = characterCatalog?.slug === gameSlug ? (characterCatalog?.assets ?? []) : [];
  const hasCharacterArtwork = Boolean(winner && selectedCharacterAssetId(winner, characterAssets));
  const hasTeamPortraits = Boolean(
    winner &&
    playerPortraitCharacters(winner).some((character) =>
      characterAssets.some((asset) => asset.character === character && asset.portraitAssetId)
    )
  );
  const availability = {
    playerPhoto: Boolean(winnerMedia?.playerPhotoAssetId),
    sponsorLogo: Boolean(winnerMedia?.sponsorLogoAssetId),
    character: hasCharacterArtwork || hasTeamPortraits
  };

  useEffect(() => {
    void api
      .resultScreenState()
      .then(setState)
      .catch((error) =>
        notifyError(error, t('workspaces.resultScreen.failedTitle'), t('workspaces.resultScreen.failed'))
      );
  }, [t]);

  useEffect(() => {
    let active = true;
    if (!identityKey) {
      return () => {
        active = false;
      };
    }
    void api
      .playerMedia()
      .then((matches) => {
        if (active) setPlayerMedia({ key: identityKey, matches });
      })
      .catch(() => {
        if (active) setPlayerMedia({ key: identityKey, matches: { playerOne: {}, playerTwo: {} } });
      });
    return () => {
      active = false;
    };
  }, [identityKey, catalogRevision]);

  useEffect(() => {
    let active = true;
    if (!gameSlug)
      return () => {
        active = false;
      };
    void api
      .gameCharacterAssets(gameSlug)
      .then(({ assets }) => {
        if (active) setCharacterCatalog({ slug: gameSlug, assets });
      })
      .catch(() => {
        if (active) setCharacterCatalog({ slug: gameSlug, assets: [] });
      });
    return () => {
      active = false;
    };
  }, [gameSlug, catalogRevision]);

  async function update<K extends keyof Omit<ResultScreenState, 'updatedAt'>>(key: K, value: ResultScreenState[K]) {
    if (!state || saving) return;
    setSaving(true);
    try {
      const next = await api.updateResultScreenState({ ...state, [key]: value });
      setState(next);
    } catch (error) {
      notifyError(error, t('workspaces.resultScreen.failedTitle'), t('workspaces.resultScreen.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (!state)
    return (
      <Text c="dimmed" size="sm">
        {t('workspaces.resultScreen.loading')}
      </Text>
    );
  const controls = [
    ['showPlayerPhoto', 'playerPhoto'],
    ['showCharacter', 'character'],
    ['showSponsorLogo', 'sponsorLogo']
  ] as const;
  return (
    <Stack gap="md" w="100%">
      <SimpleGrid type="container" cols={{ base: 1, '42rem': 3 }}>
        <Select
          label={t('workspaces.resultScreen.composition')}
          value={state.composition}
          data={[
            { value: 'classic', label: t('workspaces.resultScreen.classic') },
            { value: 'victory', label: t('workspaces.resultScreen.victory') },
            { value: 'spotlight', label: t('workspaces.resultScreen.spotlight') }
          ]}
          disabled={saving}
          allowDeselect={false}
          onChange={(value) => {
            if (value === 'classic' || value === 'victory' || value === 'spotlight') void update('composition', value);
          }}
        />

        <Select
          label={t('workspaces.styling')}
          searchable
          value={state.stylingGameId}
          data={sortedProfiles.map((profile) => ({ value: profile.id, label: profile.styleName }))}
          disabled={saving}
          onChange={(value) => value && void update('stylingGameId', value as GameId)}
        />
        <OverlayLogoSelect
          logos={logos}
          assetId={state.logoAssetId}
          disabled={saving}
          onChange={(logoAssetId) => void update('logoAssetId', logoAssetId)}
        />
      </SimpleGrid>
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2, '60rem': 3 }}>
        {controls.map(([setting, asset]) => (
          <Switch
            key={setting}
            checked={state[setting]}
            disabled={saving}
            label={t(`workspaces.resultScreen.${setting}`)}
            description={winner && !availability[asset] ? t('workspaces.resultScreen.unavailableForWinner') : undefined}
            onChange={(event) => void update(setting, event.currentTarget.checked)}
          />
        ))}
        <Switch
          description={logoAvailable ? undefined : t('workspaces.resultScreen.unavailableForWinner')}
          label={t('workspaces.resultScreen.showTournamentLogo')}
          checked={state.showTournamentLogo}
          disabled={saving}
          onChange={(event) => void update('showTournamentLogo', event.currentTarget.checked)}
        />
        <Switch
          checked={!state.showBackground}
          disabled={saving}
          label={t('workspaces.transparentBackground')}
          onChange={(event) => void update('showBackground', !event.currentTarget.checked)}
        />
        {state.composition !== 'classic' && (
          <Switch
            checked={state.showTextBackdrop}
            disabled={saving}
            label={t('workspaces.resultScreen.showTextBackdrop')}
            onChange={(event) => void update('showTextBackdrop', event.currentTarget.checked)}
          />
        )}
      </SimpleGrid>
    </Stack>
  );
}

export function ResultScreenStatus({ activeSet }: { activeSet?: SelectedSetState }) {
  const { t } = useTranslation('operator');
  const result = activeSet ? announcementPresentation(activeSet) : undefined;
  if (!result) {
    return (
      <Badge color="gray" variant="light" maw="100%" h="auto" styles={{ label: { whiteSpace: 'normal' } }}>
        {t('workspaces.resultScreen.noWinner')}
      </Badge>
    );
  }
  return (
    <Group gap="xs" wrap="nowrap">
      <Text fw={900} miw={0} style={{ overflowWrap: 'anywhere' }}>
        {result.winner.name}
      </Text>
      <Badge color={result.kind === 'champion' ? 'yellow' : 'green'} variant="light" style={{ flexShrink: 0 }}>
        {t(`workspaces.resultScreen.${result.kind}`)}
      </Badge>
    </Group>
  );
}

function notifyError(error: unknown, title: string, fallback: string) {
  notifications.show({
    title,
    message: error instanceof Error ? error.message : fallback,
    color: 'red'
  });
}
