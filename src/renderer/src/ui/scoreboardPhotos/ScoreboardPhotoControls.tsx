import { Alert, Anchor, Checkbox, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../../api';
import { useScoreboardPhotos } from '../../hooks/useScoreboardPhotos';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';
import type { SelectedSetState } from '@shared/models';
import { scoreboardPhotoLayout, type ScoreboardPhotoSettings } from '@shared/scoreboardPhotos';
import { PlayerLibraryDialog } from '../players/PlayerLibraryModal';

export function ScoreboardPhotoControls({
  selectedSet,
  logoSelectId,
  isExhibition = false
}: {
  selectedSet?: SelectedSetState;
  logoSelectId?: string;
  isExhibition?: boolean;
}) {
  const { t } = useTranslation('operator');
  const { state, setState, error } = useScoreboardPhotos();
  const [saving, setSaving] = useState(false);
  const [libraryOpened, setLibraryOpened] = useState(false);
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
    <>
      <Stack gap="xs">
        <SimpleGrid
          className="scoreboard-visibility-options scoreboard-photo-options"
          type="container"
          cols={{ base: 1, '36rem': 3 }}
        >
          <Checkbox
            label={t('scoreboardPhotos.enabled')}
            description={
              <Trans
                t={t}
                i18nKey="scoreboardPhotos.help"
                components={{
                  players: (
                    <Anchor
                      component="button"
                      type="button"
                      inherit
                      underline="always"
                      onClick={() => setLibraryOpened(true)}
                    />
                  )
                }}
              />
            }
            checked={state?.enabled ?? false}
            disabled={!state || saving}
            onChange={(event) => void save({ enabled: event.currentTarget.checked })}
          />
          {state?.enabled && (
            <>
              <Checkbox
                label={t(isExhibition ? 'editor.exhibitionLogoBackdrop' : 'scoreboardPhotos.logoBackdrop')}
                description={
                  selectedSet?.broadcast?.logoAssetId ? undefined : (
                    <Trans
                      t={t}
                      i18nKey={isExhibition ? 'editor.chooseExhibitionLogo' : 'scoreboardPhotos.chooseLogo'}
                      components={{
                        extras: logoSelectId ? (
                          <Anchor href={`#${logoSelectId}`} inherit underline="always" />
                        ) : (
                          <span />
                        )
                      }}
                    />
                  )
                }
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
        </SimpleGrid>
        {state?.enabled && selectedSet && !scoreboardPhotoLayout(selectedSet) && (
          <Text size="xs" c="dimmed">
            {t('scoreboardPhotos.unsupported')}
          </Text>
        )}
        {error && <Alert color="red">{t('scoreboardPhotos.loadFailed')}</Alert>}
      </Stack>
      <PlayerLibraryDialog selectedSet={selectedSet} opened={libraryOpened} onClose={() => setLibraryOpened(false)} />
    </>
  );
}
