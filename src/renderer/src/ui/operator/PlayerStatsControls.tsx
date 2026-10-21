import { useEffect, useMemo } from 'react';
import { Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { GameId, GameProfile } from '@shared/gameProfiles';
import type { LogoAsset } from '@shared/models';
import { api } from '../../api';
import { usePlayerStatsSettings } from '../../hooks/usePlayerStatsSettings';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { OverlayLogoSelect } from './OverlayLogoSelect';
import { sortByLabel } from './operatorUtils';

export function PlayerStatsControls({ logos, profiles }: { logos: LogoAsset[]; profiles: GameProfile[] }) {
  const { t, i18n } = useTranslation('operator');
  const { state, saving, update, reload } = useSettingsDraft({
    load: api.playerStatsSettings,
    save: api.updatePlayerStatsSettings,
    onError: (error) =>
      notifications.show({
        title: t('workspaces.playerStats.failedTitle'),
        message: error instanceof Error ? error.message : t('workspaces.playerStats.failed'),
        color: 'red'
      })
  });
  const { state: liveSettings } = usePlayerStatsSettings();
  useEffect(() => {
    if (!saving) void reload();
  }, [liveSettings, saving, reload]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const styles = useMemo(() => sortByLabel(profiles, (profile) => profile.styleName, locale), [profiles, locale]);
  if (!state)
    return (
      <Text c="dimmed" size="sm">
        {t('workspaces.playerStats.loading')}
      </Text>
    );
  const controls = [
    'showTournamentLogo',
    'showPlacementLogos',
    'showSponsorLogo',
    'showPlayerPhoto',
    'showCharacter'
  ] as const;
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('workspaces.playerStats.sharedSettings')}
      </Text>
      <SimpleGrid type="container" cols={{ base: 1, '32rem': 2 }}>
        <Select
          label={t('workspaces.styling')}
          placeholder={t('workspaces.playerStats.liveStyle')}
          data={styles.map((profile) => ({ value: profile.id, label: profile.styleName }))}
          value={state.stylingGameId ?? null}
          searchable
          clearable
          disabled={saving}
          clearButtonProps={{ 'aria-label': t('workspaces.playerStats.liveStyle') }}
          onChange={(value) => void update({ stylingGameId: value ? (value as GameId) : undefined })}
        />
        <OverlayLogoSelect
          logos={logos}
          assetId={state.logoAssetId}
          disabled={saving}
          onChange={(logoAssetId) => void update({ logoAssetId })}
        />
      </SimpleGrid>
      <SimpleGrid type="container" cols={{ base: 1, '32rem': 2 }}>
        <Switch
          label={t('workspaces.transparentBackground')}
          checked={!state.showBackground}
          disabled={saving}
          onChange={(event) => void update({ showBackground: !event.currentTarget.checked })}
        />
        {controls.map((setting) => (
          <Switch
            key={setting}
            label={t(`workspaces.playerStats.${setting}`)}
            checked={state[setting]}
            disabled={saving}
            onChange={(event) => void update({ [setting]: event.currentTarget.checked })}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
