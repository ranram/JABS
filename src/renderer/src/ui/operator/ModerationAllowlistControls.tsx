import { useState } from 'react';
import { Button, Group, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import {
  isTauriRuntime,
  openNativeModerationAllowlist,
  reloadNativeModerationAllowlist
} from '../../desktopRuntime';

export function ModerationAllowlistControls() {
  const { t } = useTranslation('operator');
  const [reloading, setReloading] = useState(false);

  if (!isTauriRuntime()) return null;

  async function openAllowlist() {
    try {
      await openNativeModerationAllowlist();
    } catch {
      notifications.show({
        color: 'red',
        message: t('moderation.openFailed'),
        withCloseButton: true
      });
    }
  }

  async function reloadAllowlist() {
    setReloading(true);
    try {
      const status = await reloadNativeModerationAllowlist();
      notifications.show({
        color: 'green',
        message: t('moderation.reloaded', { count: status.entryCount }),
        withCloseButton: true
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : t('moderation.reloadFailed'),
        autoClose: false,
        withCloseButton: true
      });
    } finally {
      setReloading(false);
    }
  }

  return (
    <Group gap="xs" wrap="nowrap">
      <Tooltip label={t('moderation.openHint')} openDelay={350}>
        <Button size="compact-xs" variant="default" onClick={() => void openAllowlist()}>
          {t('moderation.open')}
        </Button>
      </Tooltip>
      <Tooltip label={t('moderation.reloadHint')} openDelay={350}>
        <Button
          size="compact-xs"
          variant="light"
          loading={reloading}
          onClick={() => void reloadAllowlist()}
        >
          {t('moderation.reload')}
        </Button>
      </Tooltip>
    </Group>
  );
}
