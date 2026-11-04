import { createContext, useContext, useState, type ReactNode } from 'react';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { photoFramingSchema, type PhotoFraming } from '@shared/scoreboardPhotos';
import { api } from '../../api';
import { useScoreboardPhotos } from '../../hooks/useScoreboardPhotos';
import './playerPhotoFraming.css';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';

export const PhotoFramingContext = createContext<PhotoFraming>('contained');
const FramingControlsContext = createContext<ReactNode>(null);

export function PlayerPhotoFramingControls() {
  return useContext(FramingControlsContext);
}

export function PlayerPhotoFraming({ children }: { children: ReactNode }) {
  const { t } = useTranslation('operator');
  const { state, setState } = useScoreboardPhotos();
  const [saving, setSaving] = useState(false);
  const notify = useOperatorNotifications();
  async function change(value: string) {
    const parsed = photoFramingSchema.safeParse(value);
    if (!state || saving || !parsed.success) return;
    setSaving(true);
    try {
      setState(await api.updateScoreboardPhotoSettings({ ...state, framing: parsed.data }));
    } catch {
      notify(t('scoreboardPhotos.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }
  const controls = (
    <Stack gap={4} style={{ flexShrink: 0 }}>
      <Text size="sm" fw={700}>
        {t('scoreboardPhotos.framing')}
      </Text>
      <SegmentedControl
        classNames={{ root: 'photo-framing-choice', label: 'photo-framing-choice-label' }}
        withItemsBorders={false}
        aria-label={t('scoreboardPhotos.framing')}
        value={state?.framing ?? 'contained'}
        disabled={!state || saving}
        onChange={(value) => void change(value)}
        data={[
          { value: 'contained', label: t('scoreboardPhotos.contained') },
          { value: 'extendAbove', label: t('scoreboardPhotos.extendAbove') }
        ]}
      />
      <Text size="xs" c="dimmed">
        {t('scoreboardPhotos.framingHelp')}
      </Text>
    </Stack>
  );
  return (
    <PhotoFramingContext.Provider value={state?.framing ?? 'contained'}>
      <FramingControlsContext.Provider value={controls}>{children}</FramingControlsContext.Provider>
    </PhotoFramingContext.Provider>
  );
}
