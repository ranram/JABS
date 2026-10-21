import { useState } from 'react';
import { Anchor, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { isTauriRuntime } from '../../desktopRuntime';
import { invokeNative } from '../../nativeCommand';
import { useOperatorNotifications } from '../operator/useOperatorNotifications';

const supportEmail = 'akatsatech@gmail.com';
const supportMailto = `mailto:${supportEmail}?subject=JABS%20support`;

export function SupportDialog({ opened, onClose }: { opened: boolean; onClose(): void }) {
  const { t } = useTranslation('operator');
  const notify = useOperatorNotifications();
  const [busy, setBusy] = useState<string>();
  const native = isTauriRuntime();

  async function action(name: string, run: () => Promise<void>) {
    setBusy(name);
    try {
      await run();
    } catch (error) {
      notify(error instanceof Error ? error.message : t('support.failed'), 'error');
    } finally {
      setBusy(undefined);
    }
  }

  async function exportReport() {
    const report = await invokeNative<string>('diagnostic_report');
    const filename = `jabs-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`;
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(t('messages.exportCompleted', { filename }), 'success');
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t('support.title')} centered>
      <Stack gap="md">
        <Text size="sm">{t('support.description')}</Text>
        <Group gap="xs">
          <Button
            disabled={!native || Boolean(busy)}
            loading={busy === 'export'}
            onClick={() => void action('export', exportReport)}
          >
            {t('support.export')}
          </Button>
          <Button
            variant="default"
            disabled={!native || Boolean(busy)}
            loading={busy === 'folder'}
            onClick={() => void action('folder', () => invokeNative<void>('open_logs_directory'))}
          >
            {t('support.openFolder')}
          </Button>
        </Group>
        {!native && (
          <Text size="xs" c="dimmed">
            {t('support.desktopOnly')}
          </Text>
        )}
        <Group gap="xs" justify="space-between">
          <Anchor
            href={supportMailto}
            size="sm"
            onClick={(event) => {
              if (!native) return;
              event.preventDefault();
              void action('email', () => invokeNative<void>('open_support_email'));
            }}
          >
            {supportEmail}
          </Anchor>
          <Button
            variant="default"
            disabled={Boolean(busy)}
            onClick={() =>
              void action('copy', async () => {
                await navigator.clipboard.writeText(supportEmail);
                notify(t('support.copied'), 'success');
              })
            }
          >
            {t('support.copyEmail')}
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {t('support.privacy')}
        </Text>
      </Stack>
    </Modal>
  );
}
