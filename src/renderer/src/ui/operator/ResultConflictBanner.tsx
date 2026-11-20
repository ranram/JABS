import { useState } from 'react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { SelectedSetState } from '@shared/models';
import { api } from '../../api';
import { localizedNativeError } from '../../i18n/nativeErrors';
import { reportedWinnerConflict } from '../announcementPresentation';

const buttonStyles = { label: { whiteSpace: 'normal', overflowWrap: 'anywhere' } } as const;

export function ResultConflictBanner({
  activeSet,
  blocked = false,
  prominent = false
}: {
  activeSet: SelectedSetState;
  blocked?: boolean;
  prominent?: boolean;
}) {
  const { t } = useTranslation('operator');
  const [saving, setSaving] = useState(false);
  const conflict = reportedWinnerConflict(activeSet);
  if (!conflict) return null;

  const { localWinner, reportedWinner, reportedKind, usingReported } = conflict;
  const winner = usingReported ? reportedWinner : localWinner;

  async function chooseWinner(useReported: boolean) {
    if (useReported === usingReported || saving || blocked) return;
    setSaving(true);
    try {
      await api.chooseBroadcastWinner(activeSet.updatedAt, useReported);
    } catch (error) {
      notifications.show({
        title: t('workspaces.resultScreen.winnerChoiceFailed'),
        message: localizedNativeError(error),
        color: 'red'
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Alert
      title={t('workspaces.resultScreen.winnerConflict')}
      color={prominent ? 'yellow.4' : 'yellow'}
      variant={prominent ? 'filled' : 'light'}
      styles={prominent ? { title: { color: 'black' }, message: { color: 'black' } } : undefined}
      mb={prominent ? 'sm' : undefined}
      role="alert"
    >
      <Stack gap="xs">
        <div>
          <Text size="sm">
            {t('workspaces.resultScreen.localResult', {
              winner: localWinner.name,
              winnerScore: localWinner.score,
              loserScore: reportedWinner.score
            })}
          </Text>
          <Text size="sm">
            {t(
              reportedKind === 'disqualification'
                ? 'workspaces.resultScreen.reportedDqWinner'
                : 'workspaces.resultScreen.reportedWinner',
              { winner: reportedWinner.name }
            )}
          </Text>
        </div>
        <Text size="sm" fw={700}>
          {t('workspaces.resultScreen.broadcastWinner', { winner: winner.name })}
        </Text>
        <Group gap="xs">
          {(
            [
              [false, localWinner.name, 'workspaces.resultScreen.useLocalWinner'],
              [true, reportedWinner.name, 'workspaces.resultScreen.useReportedWinner']
            ] as const
          ).map(([useReported, name, label]) => (
            <Button
              key={label}
              size="xs"
              h="auto"
              mih="var(--button-height)"
              maw="100%"
              styles={buttonStyles}
              color={prominent ? 'dark' : 'yellow'}
              variant={usingReported === useReported ? 'filled' : 'outline'}
              aria-pressed={usingReported === useReported}
              disabled={saving || blocked}
              onClick={() => void chooseWinner(useReported)}
            >
              {t(label, { winner: name })}
            </Button>
          ))}
        </Group>
      </Stack>
    </Alert>
  );
}
