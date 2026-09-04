import { useState } from 'react';
import { Button, Group, Modal, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import {
  isTauriRuntime,
  getNativeModerationAllowlist,
  saveNativeModerationAllowlist,
  reloadNativeModerationAllowlist
} from '../../desktopRuntime';

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

type ModerationAllowlistControlsProps = {
  onApplied(): void;
};

export function ModerationAllowlistControls({ onApplied }: ModerationAllowlistControlsProps) {
  const { t } = useTranslation('operator');
  function translateModerationError(raw: string): string {
    if (
      raw === 'moderation.fileTooLarge' ||
      raw === 'moderation.tooManyEntries'
    ) {
      return t(raw);
    }
    if (raw.startsWith('moderation.lineTooLong|')) {
      const line = raw.slice('moderation.lineTooLong|'.length);
      return t('moderation.lineTooLong', { line });
    }
    return raw;
  }
  const [opened, setOpened] = useState(false);
  const [contents, setContents] = useState('');
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);

  if (!isTauriRuntime()) return null;

  async function openAllowlist() {
    setOpening(true);
    try {
      setContents(await getNativeModerationAllowlist());
      setOpened(true);
    } catch (error) {
      notifications.show({
        color: 'red',
        message: translateModerationError(failureMessage(error, t('moderation.openFailed'))),
        withCloseButton: true
      });
    } finally {
      setOpening(false);
    }
  }

  async function saveAllowlist() {
    setSaving(true);
    try {
      const status = await saveNativeModerationAllowlist(contents);
      onApplied();
      setOpened(false);
      notifications.show({
        color: 'green',
        message: t('moderation.saved', { count: status.entryCount }),
        withCloseButton: true
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: translateModerationError(failureMessage(error, t('moderation.saveFailed'))),
        autoClose: false,
        withCloseButton: true
      });
    } finally {
      setSaving(false);
    }
  }

  async function reloadAllowlist() {
    setReloading(true);
    try {
      const status = await reloadNativeModerationAllowlist();
      onApplied();
      notifications.show({
        color: 'green',
        message: t('moderation.reloaded', { count: status.entryCount }),
        withCloseButton: true
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: translateModerationError(failureMessage(error, t('moderation.reloadFailed'))),
        autoClose: false,
        withCloseButton: true
      });
    } finally {
      setReloading(false);
    }
  }

  return (
    <>
      <Group className="workspace-maintenance-actions" gap="xs" wrap="nowrap">
        <Tooltip label={t('moderation.openHint')} openDelay={350}>
          <Button size="compact-xs" variant="default" loading={opening} onClick={() => void openAllowlist()}>
            {t('moderation.open')}
          </Button>
        </Tooltip>
        <Tooltip label={t('moderation.reloadHint')} openDelay={350}>
          <Button
            size="compact-xs"
            variant="default"
            loading={reloading}
            onClick={() => void reloadAllowlist()}
          >
            {t('moderation.reload')}
          </Button>
        </Tooltip>
      </Group>
      <Modal
        opened={opened}
        onClose={() => !saving && setOpened(false)}
        title={t('moderation.editorTitle')}
        centered
        size="lg"
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('moderation.editorDescription')}</Text>
          <Textarea
            value={contents}
            onChange={(event) => setContents(event.currentTarget.value)}
            autosize
            minRows={12}
            maxRows={20}
            aria-label={t('moderation.editorLabel')}
          />
          <Group justify="flex-end">
            <Button variant="default" disabled={saving} onClick={() => setOpened(false)}>
              {t('moderation.cancel')}
            </Button>
            <Button loading={saving} onClick={() => void saveAllowlist()}>
              {t('moderation.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
