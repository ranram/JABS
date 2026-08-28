import { useEffect, useState } from 'react';
import { Button, Code, Group, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import {
  getNativeMediaDirectories,
  isTauriRuntime,
  openNativeModerationAllowlist,
  reloadNativeModerationAllowlist
} from '../../desktopRuntime';

export function ModerationAllowlistControls() {
  const { t } = useTranslation('operator');
  const [path, setPath] = useState<string>();
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let active = true;
    void getNativeMediaDirectories()
      .then((directories) => {
        if (active) setPath(directories?.moderationAllowlist);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

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
    <Paper withBorder p="sm" mt="md" radius="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={3} style={{ flex: 1, minWidth: '16rem' }}>
          <Text fw={700} size="sm">{t('moderation.title')}</Text>
          <Text size="xs" c="dimmed">{t('moderation.description')}</Text>
          {path && (
            <Text size="xs" c="dimmed">
              {t('moderation.path')} <Code style={{ wordBreak: 'break-all' }}>{path}</Code>
            </Text>
          )}
        </Stack>
        <Group gap="xs">
          <Button size="compact-sm" variant="default" onClick={() => void openAllowlist()}>
            {t('moderation.open')}
          </Button>
          <Button
            size="compact-sm"
            variant="light"
            loading={reloading}
            onClick={() => void reloadAllowlist()}
          >
            {t('moderation.reload')}
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
