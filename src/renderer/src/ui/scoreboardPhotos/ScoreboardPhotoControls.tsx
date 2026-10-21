import { Alert, Checkbox, Group, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../../api';
import { useScoreboardPhotos } from '../../hooks/useScoreboardPhotos';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';
import type { SelectedSetState } from '@shared/models';
import { scoreboardPhotoLayout, type ScoreboardPhotoSettings } from '@shared/scoreboardPhotos';
import { PlayerLibraryButton } from '../players/PlayerLibraryModal';

export function ScoreboardPhotoControls({ selectedSet }: { selectedSet?: SelectedSetState }) {
  const { t } = useTranslation('operator');
  const { state, setState, error } = useScoreboardPhotos();
  const [saving, setSaving] = useState(false);
  const notify = useOperatorNotifications();
  async function save(patch: Partial<Pick<ScoreboardPhotoSettings, 'enabled' | 'logoBackdrop' | 'sponsorBackdrop'>>) {
    if (!state || saving) return;
    setSaving(true);
    try {
      setState(await api.updateScoreboardPhotoSettings({ ...state, ...patch }));
    } catch {
      notify(t('scoreboardPhotos.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Stack gap={4}>
      <Group gap="lg" align="flex-start" wrap="wrap">
        <Checkbox
          label={t('scoreboardPhotos.enabled')}
          checked={state?.enabled ?? false}
          disabled={!state || saving}
          onChange={(event) => void save({ enabled: event.currentTarget.checked })}
        />
        {state?.enabled && (
          <>
            <Checkbox
              label={t('scoreboardPhotos.logoBackdrop')}
              description={selectedSet?.broadcast?.logoAssetId ? undefined : t('scoreboardPhotos.chooseLogo')}
              checked={state.logoBackdrop}
              disabled={saving || (!selectedSet?.broadcast?.logoAssetId && !state.logoBackdrop)}
              onChange={(event) => void save({ logoBackdrop: event.currentTarget.checked, sponsorBackdrop: false })}
            />
            <Checkbox
              label={t('scoreboardPhotos.sponsorBackdrop')}
              checked={state.sponsorBackdrop}
              disabled={saving}
              onChange={(event) => void save({ sponsorBackdrop: event.currentTarget.checked, logoBackdrop: false })}
            />
          </>
        )}
      </Group>
      <Text size="xs" c="dimmed">
        <Trans
          t={t}
          i18nKey="scoreboardPhotos.help"
          components={{ players: <PlayerLibraryButton selectedSet={selectedSet} inline /> }}
        />
      </Text>
      {state?.enabled && selectedSet && !scoreboardPhotoLayout(selectedSet) && (
        <Text size="xs" c="dimmed">
          {t('scoreboardPhotos.unsupported')}
        </Text>
      )}
      {error && <Alert color="red">{t('scoreboardPhotos.loadFailed')}</Alert>}
    </Stack>
  );
}
