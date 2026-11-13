import { updateArtworkFraming } from '@shared/artworkFraming';
import { useVersusMedia } from '../useVersusMedia';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { ArtworkFramingControls } from './ArtworkFramingControls';
import { useMemo } from 'react';
import { Badge, Group, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { sortByLabel } from './operatorUtils';
import { OverlayLogoSelect } from './OverlayLogoSelect';
import type { ResultScreenState } from '@shared/resultScreen';
import type { LogoAsset, SelectedSetState } from '@shared/models';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import { api } from '../../api';
import { announcementPresentation } from '../announcementPresentation';

type ResultScreenControlsProps = {
  activeSet?: SelectedSetState;
  logos: LogoAsset[];
  profiles: GameProfile[];
};

export function ResultScreenControls({ activeSet, logos, profiles }: ResultScreenControlsProps) {
  const { t, i18n } = useTranslation(['operator', 'common']);
  const {
    state,
    saving,
    update: updateDraft
  } = useSettingsDraft({
    load: api.resultScreenState,
    save: api.updateResultScreenState,
    retryInitialLoad: true,
    onError: (error) =>
      notifyError(error, t('workspaces.resultScreen.failedTitle'), t('workspaces.resultScreen.failed'))
  });
  const currentResult = activeSet ? announcementPresentation(activeSet, { allowLeadingScore: true }) : undefined;
  const winner = currentResult?.winner;
  const { media, ready } = useVersusMedia(
    winner ? activeSet : undefined,
    state?.composition === 'highlight'
  );
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const sortedProfiles = useMemo(
    () => sortByLabel(profiles, (profile) => profile.styleName, locale),
    [profiles, locale]
  );
  const selectedLogo = state?.logoAssetId ?? activeSet?.broadcast?.logoAssetId;
  const logoAvailable = logos.some(({ id }) => id === selectedLogo);
  const winnerMedia = winner === activeSet?.playerTwo ? media[1] : media[0];
  const availability = {
    playerPhoto: Boolean(winnerMedia.photoUrl),
    sponsorLogo: Boolean(winnerMedia.sponsorUrl),
    character: Boolean(winnerMedia.characterUrl || winnerMedia.characterPortraits?.length)
  };

  function update<K extends keyof Omit<ResultScreenState, 'updatedAt'>>(key: K, value: ResultScreenState[K]) {
    return updateDraft({ [key]: value } as Pick<ResultScreenState, K>);
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
          label={t('workspaces.styling')}
          searchable
          clearable
          clearButtonProps={{ 'aria-label': t('workspaces.liveStyle') }}
          placeholder={t('workspaces.liveStyle')}
          value={state.stylingGameId ?? null}
          data={sortedProfiles.map((profile) => ({ value: profile.id, label: profile.styleName }))}
          disabled={saving}
          onChange={(value) => void update('stylingGameId', value ? (value as GameId) : undefined)}
        />
        <OverlayLogoSelect
          logos={logos}
          assetId={state.logoAssetId}
          disabled={saving}
          onChange={(logoAssetId) => void update('logoAssetId', logoAssetId)}
        />
        <Select
          label={t('workspaces.resultScreen.composition')}
          value={state.composition}
          data={[
            { value: 'classic', label: t('workspaces.resultScreen.classic') },
            { value: 'victory', label: t('workspaces.resultScreen.victory') },
            { value: 'spotlight', label: t('workspaces.resultScreen.spotlight') },
            { value: 'highlight', label: t('workspaces.resultScreen.highlight') }
          ]}
          disabled={saving}
          onChange={(value) => {
            if (value === 'classic' || value === 'victory' || value === 'spotlight' || value === 'highlight')
              void update('composition', value);
          }}
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
        <Switch
          checked={state.showWinnerTitle}
          disabled={saving}
          label={t('workspaces.resultScreen.showWinnerTitle')}
          onChange={(event) => void update('showWinnerTitle', event.currentTarget.checked)}
        />
        {state.composition === 'highlight' && (
          <>
            <Switch
              checked={state.showIdentity}
              disabled={saving}
              label={t('workspaces.resultScreen.showIdentity')}
              onChange={(event) => void update('showIdentity', event.currentTarget.checked)}
            />
            <Switch
              checked={state.showConfetti}
              disabled={saving}
              label={t('workspaces.resultScreen.showConfetti')}
              onChange={(event) => void update('showConfetti', event.currentTarget.checked)}
            />
          </>
        )}
      </SimpleGrid>
      {activeSet && (
        <ArtworkFramingControls
          activeSet={activeSet}
          framing={state.artworkFraming}
          stylingGameId={state.stylingGameId}
          layout={state.composition}
          highlightSettings={state}
          winnerSide={winner ? (winner === activeSet.playerOne ? 0 : 1) : undefined}
          showCharacter={state.showCharacter}
          showPhoto={state.showPlayerPhoto}
          showBackground={state.showBackground}
          media={media}
          ready={ready}
          onChange={(key, transform, mirroredKey, mirrorX) =>
            void updateDraft((current) => ({
              ...current,
              artworkFraming: updateArtworkFraming(current.artworkFraming, key, transform, mirroredKey, mirrorX)
            }))
          }
        />
      )}
    </Stack>
  );
}

export function ResultScreenStatus({ activeSet }: { activeSet?: SelectedSetState }) {
  const { t } = useTranslation('operator');
  const result = activeSet ? announcementPresentation(activeSet, { allowLeadingScore: true }) : undefined;
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
