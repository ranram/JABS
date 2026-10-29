import { useState } from 'react';
import { Button, Group, Menu, Modal, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import {
  isTauriRuntime,
  getNativeModerationAllowlist,
  saveNativeModerationAllowlist,
  reloadNativeModerationAllowlist
} from '../../desktopRuntime';
import { OperatorIcon, ShieldCheckIcon, PencilSimpleIcon, ArrowsClockwiseIcon } from '../icons';

function failureMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' && error.trim() ? error : fallback;
}

type ModerationAllowlistControlsProps = {
  onApplied(): void;
};

export function ModerationAllowlistControls({ onApplied }: ModerationAllowlistControlsProps) {
  const { t } = useTranslation('operator');
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
        message: failureMessage(error, t('moderation.openFailed')),
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
        message: failureMessage(error, t('moderation.saveFailed')),
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
        message: failureMessage(error, t('moderation.reloadFailed')),
        withCloseButton: true
      });
    } finally {
      setReloading(false);
    }
  }

  return (
    <>
      <Menu position="bottom-start" shadow="md" width={280}>
        <Menu.Target>
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<OperatorIcon icon={ShieldCheckIcon} size={14} />}
            rightSection={<span aria-hidden="true">▾</span>}
          >
            {t('utilityGroups.moderation')}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            disabled={opening || saving || reloading}
            onClick={() => void openAllowlist()}
            leftSection={<OperatorIcon icon={PencilSimpleIcon} />}
          >
            {t('moderation.open')}
          </Menu.Item>
          <Menu.Item
            disabled={opening || saving || reloading}
            onClick={() => void reloadAllowlist()}
            leftSection={<OperatorIcon icon={ArrowsClockwiseIcon} />}
          >
            {t('moderation.reload')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
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
          <Text size="sm" c="dimmed">
            {t('moderation.editorDescription')}
          </Text>
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
