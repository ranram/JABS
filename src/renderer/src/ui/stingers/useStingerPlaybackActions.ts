import { useCallback, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { StingerKind, StingerPlaybackResult } from '@shared/stingers';
import { api } from '../../api';

/** Keyboard and Stream Deck share the same playback checks and duplicate guard. */
export function useStingerPlaybackActions() {
  const { t } = useTranslation('operator');
  const pending = useRef(false);
  return useCallback(
    async (kind: StingerKind): Promise<StingerPlaybackResult> => {
      if (pending.current) return 'blocked';
      pending.current = true;
      try {
        const state = await api.stingers();
        if (!state.settings[kind].video) return 'unconfigured';
        await api.playStinger(kind);
        return 'completed';
      } catch (error) {
        notifications.show({
          title: t('notices.actionFailed'),
          message: error instanceof Error ? error.message : t('stingers.failed'),
          color: 'red'
        });
        return 'failed';
      } finally {
        pending.current = false;
      }
    },
    [t]
  );
}
