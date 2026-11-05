import type { ShortcutConfirmationKind } from './useWorkspaceShortcuts';
import { useEffect } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { DestructiveButton } from '../DestructiveButton';
import { shortcutCode } from './useScoreShortcuts';

const confirmationCopy = {
  queue: { title: 'queue.clear', message: 'shortcutConfirm.clearQueue' },
  players: { title: 'editor.clearPlayers', message: 'shortcutConfirm.clearPlayers' },
  scores: { title: 'shortcutConfirm.resetScoresTitle', message: 'shortcutConfirm.resetScores' }
} as const;

export function ShortcutConfirmation({
  kind,
  onConfirm,
  onCancel
}: {
  kind?: ShortcutConfirmationKind;
  onConfirm(): void;
  onCancel(): void;
}) {
  const { t } = useTranslation('operator');
  const configuringStinger = kind === 'stinger-perfect' || kind === 'stinger-winner';
  const copy = confirmationCopy[kind === 'queue' || kind === 'scores' ? kind : 'players'];
  const title = configuringStinger ? t('stingers.configure') : t(copy.title);
  const message = configuringStinger
    ? t('stingers.configureMissing', { name: t(kind === 'stinger-perfect' ? 'stingers.perfect' : 'stingers.winner') })
    : t(copy.message);
  useEffect(() => {
    if (!kind) return;
    function handle(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey)
        return;
      const code = shortcutCode(event);
      if (code === 'KeyY') {
        event.preventDefault();
        onConfirm();
      }
      if (code === 'KeyN' || code === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [kind, onConfirm, onCancel]);
  return (
    <Modal opened={Boolean(kind)} onClose={onCancel} title={title} size="sm" closeOnClickOutside={false}>
      <Text size="sm">{message}</Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" data-autofocus onClick={onCancel}>
          {t('shortcutConfirm.no')}
        </Button>
        {configuringStinger ? (
          <Button onClick={onConfirm}>{t('shortcutConfirm.yes')}</Button>
        ) : (
          <DestructiveButton onClick={onConfirm}>{t('shortcutConfirm.yes')}</DestructiveButton>
        )}
      </Group>
    </Modal>
  );
}
