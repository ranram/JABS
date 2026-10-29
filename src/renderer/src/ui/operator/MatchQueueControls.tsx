import { currentQueueIndex } from './queuePresentation';
import { Badge, Button, Group, Menu, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { MatchQueue } from '@shared/matchQueue';
import { HintedButton } from './HintedButton';
import { localizedNativeError } from '../../i18n/nativeErrors';
import { useMatchQueue } from './matchQueueContext';
import { OperatorIcon, ListNumbersIcon, ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from '../icons';

function formatCountdown(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function useQueueStatus(state?: MatchQueue) {
  const { t } = useTranslation('operator');
  if (!state) return t('ux.loadingQueue');
  if (state.status === 'countdown' || (state.status === 'paused' && state.remainingMs !== null)) {
    return t(state.status === 'paused' ? 'queue.pausedCountdown' : 'queue.countdown', {
      time: formatCountdown(state.remainingMs ?? 0)
    });
  }
  return t(`queue.status.${state.status}`);
}
export function QueueButton({
  compact = false,
  showStatus = false,
  menuItem = false
}: {
  compact?: boolean;
  showStatus?: boolean;
  menuItem?: boolean;
}) {
  const queue = useMatchQueue();
  const { t } = useTranslation(['operator', 'common']);
  const status = useQueueStatus(queue?.state);
  if (!queue) return null;
  const next = queue.state?.entries[(currentQueueIndex(queue.state, queue.liveSetId) ?? -1) + 1];
  const compactStatus = queue.state?.running
    ? queue.state.status === 'countdown'
      ? formatCountdown(queue.state.remainingMs ?? 0)
      : t('ux.automatic')
    : t('queue.status.paused');
  const detail =
    showStatus && queue.state?.entries.length
      ? `${status}${next ? ` · ${t('queue.upNext')}: ${next.playerOne} ${t('common:match.versus')} ${next.playerTwo}` : ''}`
      : undefined;
  const statusBadge =
    showStatus && queue.state?.entries.length ? (
      <Badge size="xs" variant="light" color={queue.state.running ? 'teal' : 'gray'}>
        {compactStatus}
      </Badge>
    ) : undefined;
  if (menuItem) {
    return (
      <>
        <Menu.Item
          data-tutorial="queue-open"
          title={detail}
          leftSection={<OperatorIcon icon={ListNumbersIcon} />}
          rightSection={statusBadge}
          onClick={queue.open}
        >
          {t('queue.open', { count: queue.state?.entries.length ?? 0 })}
        </Menu.Item>
        {showStatus && queue.state?.running && (
          <Menu.Item
            disabled={queue.busy}
            leftSection={<OperatorIcon icon={PauseIcon} />}
            onClick={() => void queue.act({ action: 'pause' })}
          >
            {t('queue.pause')}
          </Menu.Item>
        )}
      </>
    );
  }
  return (
    <Group gap={4} wrap="nowrap">
      <Button
        variant="default"
        size={compact ? 'compact-xs' : 'compact-sm'}
        leftSection={<OperatorIcon icon={ListNumbersIcon} size={compact ? 14 : 16} />}
        title={detail}
        rightSection={statusBadge}
        onClick={queue.open}
      >
        {t('queue.open', { count: queue.state?.entries.length ?? 0 })}
      </Button>
      {showStatus && queue.state?.running && (
        <Button
          size="compact-xs"
          variant="default"
          disabled={queue.busy}
          leftSection={<OperatorIcon icon={PauseIcon} size={14} />}
          onClick={() => void queue.act({ action: 'pause' })}
        >
          {t('queue.pause')}
        </Button>
      )}
    </Group>
  );
}
export function QueueStartButton() {
  const queue = useMatchQueue();
  const { t } = useTranslation('operator');
  if (!queue?.state) return null;
  const state = queue.state;
  return (
    <Button
      fullWidth
      disabled={
        state.running ||
        queue.busy ||
        queue.blocked ||
        state.status === 'loading' ||
        queue.context?.eventId !== state.context?.eventId ||
        !state.entries.length
      }
      onClick={() => void queue.act({ action: 'start' })}
    >
      {t('queue.start')}
    </Button>
  );
}

export function QueuePlaybackButton() {
  const queue = useMatchQueue();
  const { t } = useTranslation('operator');
  if (!queue?.state) return null;
  const state = queue.state;
  const canResume =
    state.mode !== 'manual' &&
    state.cursor !== null &&
    queue.context?.eventId === state.context?.eventId &&
    state.status !== 'loading' &&
    !queue.blocked;
  return (
    <Button
      fullWidth
      variant="default"
      leftSection={<OperatorIcon icon={state.running ? PauseIcon : PlayIcon} />}
      disabled={queue.busy || (!state.running && !canResume)}
      onClick={() => void queue.act({ action: state.running ? 'pause' : 'resume' })}
    >
      {t(state.running ? 'queue.pause' : 'queue.resume')}
    </Button>
  );
}

export function QueueNavigation({ showPlayback = true }: { showPlayback?: boolean }) {
  const queue = useMatchQueue();
  const { t } = useTranslation('operator');
  if (!queue?.state) return null;
  const state = queue.state;
  const index = currentQueueIndex(state, queue.liveSetId);
  const sameEvent = queue.context?.eventId === state.context?.eventId;
  const reason = !sameEvent
    ? t('queue.otherEvent')
    : state.status === 'loading'
      ? t('queue.status.loading')
      : queue.busy || queue.blocked
        ? (queue.waitReason ?? t('ux.queueWorking'))
        : undefined;
  const disabled = Boolean(reason);
  return (
    <SimpleGrid type="container" cols={{ base: 1, '28rem': 2 }} spacing="xs">
      <HintedButton
        fullWidth
        leftSection={<OperatorIcon icon={ArrowLeftIcon} />}
        reason={reason ?? (index === null || index === 0 ? t('ux.noPrevious') : undefined)}
        variant="default"
        disabled={disabled || index === null || index === 0}
        onClick={() => void queue.act({ action: 'previous' })}
      >
        {t('queue.previous')}
      </HintedButton>
      <HintedButton
        fullWidth
        rightSection={<OperatorIcon icon={ArrowRightIcon} />}
        reason={
          reason ??
          (!state.entries.length || (index !== null && index >= state.entries.length - 1) ? t('ux.noNext') : undefined)
        }
        variant="default"
        disabled={disabled || !state.entries.length || (index !== null && index >= state.entries.length - 1)}
        onClick={() => void queue.act({ action: 'next' })}
      >
        {t('queue.next')}
      </HintedButton>
      {showPlayback && state.mode !== 'manual' && state.cursor !== null && (
        <div style={{ gridColumn: '1 / -1' }}>
          <QueuePlaybackButton />
        </div>
      )}
    </SimpleGrid>
  );
}
export function MatchQueueControls() {
  const queue = useMatchQueue();
  const { t } = useTranslation(['operator', 'common']);
  const status = useQueueStatus(queue?.state);
  if (!queue || (!queue.state?.entries.length && !queue.error)) return null;
  const state = queue.state;
  const showPlayback = state?.mode !== 'manual' && state?.cursor != null;
  const index = state ? currentQueueIndex(state, queue.liveSetId) : null;
  const current = state?.entries[index ?? -1];
  const next = state?.entries[(index ?? -1) + 1];
  return (
    <Stack gap="xs" className="match-queue-inset">
      <Group justify="space-between">
        <Text fw={700} size="sm">
          {t('queue.title')}
        </Text>
        <QueueButton />
      </Group>
      {state && state.entries.length > 0 && (
        <>
          <Text size="xs" c="dimmed">
            {state.status === 'waiting-edits' ? (queue.waitReason ?? status) : status}
          </Text>
          {current && current.setId !== queue.liveSetId && (
            <Text size="xs">
              {t('ux.queuePosition')}: {current.playerOne} {t('common:match.versus')} {current.playerTwo}
            </Text>
          )}
          {next && (
            <Text size="xs">
              {t('queue.upNext')}: {next.playerOne} {t('common:match.versus')} {next.playerTwo}
            </Text>
          )}
          <QueueNavigation showPlayback={false} />
          <SimpleGrid type="container" cols={{ base: 1, '28rem': showPlayback ? 2 : 1 }} spacing="xs">
            <QueueStartButton />
            {showPlayback && <QueuePlaybackButton />}
          </SimpleGrid>
        </>
      )}
      {(queue.error || state?.error) && (
        <Text size="xs" c="red" role="status">
          {queue.error ?? localizedNativeError(state?.error)}
        </Text>
      )}
    </Stack>
  );
}
