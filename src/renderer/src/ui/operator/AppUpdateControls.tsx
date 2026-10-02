import { useState } from 'react';
import { Alert, Button, Group, Modal, Progress, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAppUpdates } from './useAppUpdates';
import { usePendingWrites } from '../../pendingWrites';

export function AppUpdateControls({ blocked }: { blocked: boolean }) {
  const pendingWrites = usePendingWrites();
  blocked = blocked || pendingWrites;
  const { t } = useTranslation(['operator', 'common']);
  const updater = useAppUpdates();
  const [opened, setOpened] = useState(false);
  const { support, phase, failure, release, progress } = updater;
  const busy = ['checking', 'downloading', 'installing', 'restarting'].includes(phase);
  const installing = ['downloading', 'installing', 'restarting'].includes(phase);
  const installed = phase === 'installed' || phase === 'restarting';
  if (!support && !failure) return null;
  const unavailable = support?.availability !== 'available';
  const reason =
    support?.availability === 'package-manager'
      ? t('operator:updates.packageManager')
      : support?.availability === 'development'
        ? t('operator:updates.development')
        : t('operator:updates.unavailable');
  const status = failure
    ? t(`operator:updates.${failure}Failed`)
    : installed
      ? t('operator:updates.installed')
      : phase === 'current'
        ? t('operator:updates.current')
        : release
          ? t('operator:updates.available', { version: release.version })
          : '';
  return (
    <>
      <Group gap="xs" align="center">
        {support && (
          <Text size="xs" c="dimmed">
            v{support.version}
          </Text>
        )}
        <Tooltip label={unavailable ? reason : status} disabled={!unavailable && !status}>
          <span>
            <Button
              size="xs"
              variant="default"
              loading={phase === 'checking'}
              disabled={unavailable || busy || installed}
              onClick={() => void updater.checkForUpdates()}
            >
              {t('operator:updates.check')}
            </Button>
          </span>
        </Tooltip>
        {(release || installed) && (
          <Tooltip label={t('operator:updates.finishEditing')} disabled={!blocked}>
            <span>
              <Button size="xs" loading={installing} disabled={blocked || busy} onClick={() => setOpened(true)}>
                {installed ? t('operator:updates.restart') : t('operator:updates.updateNow')}
              </Button>
            </span>
          </Tooltip>
        )}
        {status && (
          <Text size="xs" c={failure ? 'red' : 'dimmed'} role="status">
            {status}
          </Text>
        )}
      </Group>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        closeOnClickOutside={!installing}
        closeOnEscape={!installing}
        withCloseButton={!installing}
        title={t('operator:updates.title')}
      >
        <Stack>
          <Text>
            {installed
              ? t('operator:updates.installed')
              : t('operator:updates.confirm', {
                  current: support?.version ?? '',
                  next: release?.version ?? ''
                })}
          </Text>
          <Text size="sm" c="dimmed">
            {t('operator:updates.restartNotice')}
          </Text>
          {release?.notes && (
            <ScrollArea.Autosize mah={220}>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {release.notes}
              </Text>
            </ScrollArea.Autosize>
          )}
          {phase === 'downloading' && (
            <>
              <Text size="sm" role="status">
                {t('operator:updates.downloading')}
              </Text>
              {progress !== undefined && <Progress value={progress} aria-label={t('operator:updates.downloading')} />}
            </>
          )}
          {phase === 'installing' && <Text role="status">{t('operator:updates.installing')}</Text>}
          {phase === 'restarting' && <Text role="status">{t('operator:updates.restarting')}</Text>}
          {failure && <Alert color="red">{t(`operator:updates.${failure}Failed`)}</Alert>}
          {blocked && <Alert color="yellow">{t('operator:updates.finishEditing')}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" disabled={installing} onClick={() => setOpened(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              disabled={blocked || busy}
              loading={installing}
              onClick={() => {
                if (installed) void updater.restartApp(blocked);
                else void updater.installUpdate(blocked);
              }}
            >
              {installed ? t('operator:updates.restart') : t('operator:updates.installRestart')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
