import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  VisuallyHidden
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PanelHeader } from '../PanelHeader';
import { ListNumbersIcon, ArrowUpIcon, ArrowDownIcon, MonitorIcon, TrashSimpleIcon } from '../icons';
import { QueueIconButton } from './QueueIconButton';
import { currentQueueIndex } from './queuePresentation';
import type { QueueMode } from '@shared/matchQueue';
import { MatchCardSummary } from './MatchCardSummary';
import { useMatchQueue } from './matchQueueContext';
import { useTutorialActive } from '../tutorials/tutorialActivity';
import { QueueNavigation, QueueStartButton, QueuePlaybackButton, useQueueStatus } from './MatchQueueControls';
import { localizedNativeError } from '../../i18n/nativeErrors';
import { DestructiveButton } from '../DestructiveButton';
import './matchQueue.css';
import { QueueTopEightButton } from './QueueTopEightButton';

export function MatchQueueModal() {
  const queue = useMatchQueue();
  const { t } = useTranslation('operator');
  const tutorialActive = useTutorialActive();
  if (!queue) return null;
  return (
    <Modal
      opened={queue.opened}
      onClose={() => {
        queue.hold(false);
        queue.close();
      }}
      title={t('queue.title')}
      size="xl"
      centered
      trapFocus={!tutorialActive}
      closeOnEscape={!tutorialActive}
      closeOnClickOutside={!tutorialActive}
      overlayProps={{ backgroundOpacity: 0.72, blur: 5 }}
      returnFocus
    >
      <MatchQueueContents />
    </Modal>
  );
}

// The modal shell stays mounted to restore keyboard focus after closing.
// Mantine unmounts the contents when the closing transition finishes.
function MatchQueueContents() {
  const queue = useMatchQueue();
  const { t } = useTranslation(['operator', 'common']);
  const status = useQueueStatus(queue?.state);
  const [announcement, setAnnouncement] = useState('');
  const [minutes, setMinutes] = useState<number | string>(queue?.state?.delayMinutes ?? 1);
  useEffect(() => {
    if (queue?.state) setMinutes(queue.state.delayMinutes);
  }, [queue?.state?.delayMinutes, queue?.opened]);
  if (!queue) return null;
  const state = queue.state;
  const entries = state?.entries ?? [];
  const sameEvent = !state?.context || queue.context?.eventId === state.context.eventId;
  const firstMovableIndex = state?.running ? (state.cursor ?? -1) + 1 : 0;
  const currentIndex = state ? currentQueueIndex(state, queue.liveSetId) : null;
  const upNextIndex = (currentIndex ?? -1) + 1;
  const disabled = queue.busy || !state || state.status === 'loading';
  async function move(from: number, to: number) {
    if (!queue || !state || from < firstMovableIndex || to < firstMovableIndex || from === to || to >= entries.length)
      return;
    const order = entries.map((e) => e.setId);
    const [id] = order.splice(from, 1);
    order.splice(to, 0, id);
    setAnnouncement('');
    const moved = await queue.act({ action: 'reorder', order });
    if (moved) setAnnouncement(t('operator:queue.moved', { position: to + 1 }));
  }
  return (
    <Stack gap="md" className="match-queue-modal" data-tutorial="queue-panel" data-opened={queue.opened}>
      <PanelHeader
        title={state?.context?.eventName ?? queue.context?.eventName ?? t('operator:queue.chooseEvent')}
        description={<span role="status">{status}</span>}
        icon={ListNumbersIcon}
        order={3}
        inset="md"
      >
        <Badge variant="light">{t('operator:queue.matchCount', { count: entries.length })}</Badge>
      </PanelHeader>
      {(queue.error || state?.error) && (
        <Alert color="red" role="status">
          {queue.error ?? localizedNativeError(state?.error)}
        </Alert>
      )}
      {!sameEvent && <Alert color="yellow">{t('operator:queue.otherEvent')}</Alert>}
      <QueueTopEightButton />
      {state && (
        <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }} data-tutorial="queue-settings">
          <Select
            label={t('operator:queue.advance')}
            value={state.mode}
            allowDeselect={false}
            disabled={disabled || queue.blocked || !sameEvent}
            data={(['manual', 'report', 'winner-delay'] as const).map((value) => ({
              value,
              label: t(`operator:queue.modes.${value}`)
            }))}
            onFocus={() => queue.hold(true)}
            onBlur={() => queue.hold(false)}
            onChange={(mode) =>
              mode && void queue.act({ action: 'settings', mode: mode as QueueMode, delayMinutes: state.delayMinutes })
            }
          />
          {state.mode === 'winner-delay' && (
            <NumberInput
              label={t('operator:queue.delay')}
              min={1}
              max={30}
              allowDecimal={false}
              allowNegative={false}
              value={minutes}
              disabled={disabled}
              clampBehavior="strict"
              onFocus={() => queue.hold(true)}
              onBlur={() => {
                queue.hold(false);
                if (typeof minutes === 'number' && minutes >= 1 && minutes <= 30 && minutes !== state.delayMinutes) {
                  void queue.act({ action: 'settings', mode: state.mode, delayMinutes: minutes });
                } else setMinutes(state.delayMinutes);
              }}
              onChange={setMinutes}
            />
          )}
        </SimpleGrid>
      )}
      {state && (
        <Text size="xs" c="dimmed">
          {t(`operator:queue.help.${state.mode}`)}
        </Text>
      )}
      <ScrollArea.Autosize
        className="match-list-frame"
        mah="clamp(100px, calc(100dvh - 450px), 48vh)"
        type="auto"
        offsetScrollbars="present"
      >
        <Stack gap="sm" p="sm" role="list" aria-label={t('operator:queue.order')} data-tutorial="queue-list">
          {!entries.length && (
            <Text c="dimmed" ta="center" py="xl">
              {t('operator:queue.emptyHelp')}
            </Text>
          )}
          {entries.map((entry, index) => (
            <Paper
              key={entry.setId}
              role="listitem"
              withBorder
              p={0}
              radius="md"
              data-on-stream={entry.setId === queue.liveSetId}
              data-current={index === currentIndex}
              data-up-next={index === upNextIndex}
              className="match-queue-row"
              data-testid={`queue-entry-${entry.setId}`}
            >
              <Stack gap="xs">
                <Box p="md" pb={0}>
                  <MatchCardSummary
                    context={[entry.phase, entry.round].filter(Boolean).join(' · ')}
                    queuePosition={index}
                    playerOne={entry.playerOne}
                    playerTwo={entry.playerTwo}
                    badges={
                      <>
                        {entry.setId === queue.liveSetId && index !== currentIndex && (
                          <Badge size="sm" color="green" variant="light">
                            {t('operator:ux.streamMatch')}
                          </Badge>
                        )}
                        {index === currentIndex && (
                          <Badge size="sm" color="teal" variant="light">
                            {t('operator:queue.current')}
                          </Badge>
                        )}
                        {entry.resultStatus && (
                          <Badge
                            size="sm"
                            color={entry.resultStatus === 'reported' ? 'teal' : 'blue'}
                            variant="light"
                            title={t(`operator:queue.${entry.resultStatus}Help`)}
                          >
                            {entry.resultStatus === 'reported'
                              ? t('operator:queue.reported')
                              : t('common:status.completed')}
                          </Badge>
                        )}
                        {index === upNextIndex && (
                          <Badge size="sm" variant="light">
                            {t('operator:queue.upNext')}
                          </Badge>
                        )}
                      </>
                    }
                  />
                </Box>
                <Group className="match-queue-actions" justify="flex-end" gap="xs" wrap="nowrap" px="md" pb="sm">
                  <QueueIconButton
                    label={t('operator:queue.moveUp')}
                    icon={ArrowUpIcon}
                    disabled={disabled || index <= firstMovableIndex}
                    onClick={() => void move(index, index - 1)}
                  />
                  <QueueIconButton
                    label={t('operator:queue.moveDown')}
                    icon={ArrowDownIcon}
                    disabled={disabled || index < firstMovableIndex || index === entries.length - 1}
                    onClick={() => void move(index, index + 1)}
                  />
                  <QueueIconButton
                    label={t('operator:queue.send')}
                    icon={MonitorIcon}
                    disabled={disabled || queue.blocked || !sameEvent}
                    onClick={() => void queue.act({ action: 'jump', setId: entry.setId })}
                  />
                  <QueueIconButton
                    label={t('operator:queue.remove')}
                    icon={TrashSimpleIcon}
                    destructive
                    disabled={disabled}
                    onClick={() => void queue.act({ action: 'remove', setId: entry.setId })}
                  />
                </Group>
              </Stack>
            </Paper>
          ))}
        </Stack>
      </ScrollArea.Autosize>
      <VisuallyHidden aria-live="polite" className="match-queue-announcement">
        {announcement}
      </VisuallyHidden>
      <SimpleGrid type="container" cols={{ base: 1, '36rem': 2 }} data-tutorial="queue-playback">
        {!state?.running && <QueueStartButton />}
        {state?.running && <QueuePlaybackButton />}
        <DestructiveButton disabled={disabled || !entries.length} onClick={() => void queue.act({ action: 'clear' })}>
          {t('operator:queue.clear')}
        </DestructiveButton>
      </SimpleGrid>
      <QueueNavigation showPlayback={!state?.running} />
    </Stack>
  );
}
