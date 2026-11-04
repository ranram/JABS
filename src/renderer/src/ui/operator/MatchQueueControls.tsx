import { currentQueueIndex } from './queuePresentation';
import { Badge, Button, Group, Menu, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { MatchQueue, QueueEntry } from '@shared/matchQueue';
import { displayPhaseName } from '@shared/matchContext';
import { PanelHeader } from '../PanelHeader';
import './matchQueueCards.css';
import { MatchCardSummary } from './MatchCardSummary';
import { SetSelectorButton } from './SetSelectorButton';
import './matchQueueControls.css';
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
          aria-keyshortcuts="F6 Control+Shift+Q"
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
        aria-keyshortcuts="F6 Control+Shift+Q"
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
      aria-keyshortcuts="Control+Shift+Space"
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
        aria-keyshortcuts="Control+Shift+P"
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
        aria-keyshortcuts="Control+Shift+N"
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
  if (!queue) return null;
  const state = queue.state;
  const showPlayback = state?.mode !== 'manual' && state?.cursor != null;
  const index = state ? currentQueueIndex(state, queue.liveSetId) : null;
  const current = state?.entries[index ?? -1];
  const next = state?.entries[(index ?? -1) + 1];
  return (
    <Stack gap="xs" className="match-queue-inset">
      <PanelHeader title={t('queue.title')} icon={ListNumbersIcon} order={3} className="queue-controls-header">
        <Group gap="xs">
          <Badge
            className="queue-status-pill"
            data-running={state?.running || undefined}
            variant="light"
            color={state?.running ? 'teal' : 'gray'}
            radius="xl"
            styles={{ label: { whiteSpace: 'normal' } }}
          >
            {status}
          </Badge>
          <QueueButton />
        </Group>
      </PanelHeader>
      {state && state.entries.length > 0 && (
        <>
          {state.status === 'waiting-edits' && queue.waitReason && (
            <Text size="xs" c="dimmed">
              {queue.waitReason}
            </Text>
          )}
          <SimpleGrid type="container" cols={{ base: 1, '34rem': current && next ? 2 : 1 }} spacing="xs">
            {current && (
              <QueueMatchCard
                entry={current}
                label={t('queue.current')}
                kind="current"
                position={index ?? 0}
                onStream={current.setId === queue.liveSetId}
                onOpen={queue.open}
              />
            )}
            {next && (
              <QueueMatchCard
                entry={next}
                label={t('queue.upNext')}
                kind="next"
                position={(index ?? -1) + 1}
                onStream={false}
                onOpen={queue.open}
              />
            )}
          </SimpleGrid>
          <QueueNavigation showPlayback={false} />
          <SimpleGrid type="container" cols={{ base: 1, '28rem': showPlayback ? 2 : 1 }} spacing="xs">
            <QueueStartButton />
            {showPlayback && <QueuePlaybackButton />}
          </SimpleGrid>
        </>
      )}
      {state && !state.entries.length && !queue.error && !state.error && (
        <Stack gap="xs" className="queue-match-empty operator-inset">
          <Text size="sm" c="dimmed">
            {t('queue.emptyHelp')}
          </Text>
          <Group>
            <SetSelectorButton />
          </Group>
        </Stack>
      )}
      {(queue.error || state?.error) && (
        <Text size="xs" c="red" ta="center" role="status">
          {queue.error ?? localizedNativeError(state?.error)}
        </Text>
      )}
    </Stack>
  );
}

function QueueMatchCard({
  entry,
  label,
  kind,
  position,
  onStream,
  onOpen
}: {
  entry: QueueEntry;
  label: string;
  kind: 'current' | 'next';
  position: number;
  onStream: boolean;
  onOpen(): void;
}) {
  const { t } = useTranslation('common');
  return (
    <UnstyledButton
      className="queue-match-card match-queue-row operator-inset"
      data-current={kind === 'current' || undefined}
      data-up-next={kind === 'next' || undefined}
      data-on-stream={onStream || undefined}
      onClick={onOpen}
      aria-label={`${label}: ${entry.playerOne} ${t('match.versus')} ${entry.playerTwo}`}
    >
      <MatchCardSummary
        context={[displayPhaseName(entry.phase), entry.round].filter(Boolean).join(' · ')}
        playerOne={entry.playerOne}
        playerTwo={entry.playerTwo}
        queuePosition={position}
        badges={
          <>
            <Badge color={kind === 'current' ? 'teal' : 'violet'} variant="light">
              {label}
            </Badge>
            {onStream && (
              <Badge color="green" variant="light">
                {t('status.onStream')}
              </Badge>
            )}
          </>
        }
      />
    </UnstyledButton>
  );
}
