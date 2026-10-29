import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SetSummary } from '@shared/models';
import { topEightQueueSets } from '@shared/topEightQueue';
import { isTopEightPhaseName } from '@shared/topEightMatchups';
import { api } from '../../api';
import { useMatchQueue } from './matchQueueContext';

export function QueueTopEightButton() {
  const queue = useMatchQueue();
  const { t } = useTranslation(['operator', 'common']);
  const [detecting, setDetecting] = useState(false);
  const [plan, setPlan] = useState<SetSummary[]>();
  const [error, setError] = useState<string>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queue?.hold(false);
    };
  }, []);
  if (!queue) return null;
  const otherEvent = queue.state?.context && queue.state.context.eventId !== queue.context?.eventId;
  function close() {
    setPlan(undefined);
    queue?.hold(false);
  }
  async function detect() {
    const context = queue?.context;
    if (!queue || !context) return;
    setDetecting(true);
    setError(undefined);
    queue.hold(true);
    try {
      const { phases } = await api.phases(context.eventId);
      const phase = phases.find(({ name }) => isTopEightPhaseName(name));
      const scope = phase
        ? { type: 'phase' as const, eventId: context.eventId, phaseId: phase.id }
        : { type: 'event' as const, eventId: context.eventId };
      const first = await api.sets(scope, 1, 50);
      if (first.pageInfo.totalPages > 200) throw new Error(t('topEightMatchups.tooLarge'));
      const sets = [...first.sets];
      for (let page = 2; page <= first.pageInfo.totalPages; page += 4) {
        if (!mounted.current) return;
        const pages = Array.from({ length: Math.min(4, first.pageInfo.totalPages - page + 1) }, (_, i) => page + i);
        const results = await Promise.all(pages.map((p) => api.sets(scope, p, 50)));
        sets.push(...results.flatMap((result) => result.sets));
      }
      if (!mounted.current) return;
      const detected = topEightQueueSets(sets);
      if (!detected) throw new Error(t('queue.topEightNotDetected'));
      const missing = detected.filter(
        (set) => set.state !== '3' && !queue.state?.entries.some((entry) => entry.setId === set.id)
      );
      if (!missing.length) throw new Error(t('queue.topEightAlreadyQueued'));
      setPlan(missing);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : t('queue.actionFailed'));
      queue.hold(false);
    } finally {
      if (mounted.current) setDetecting(false);
    }
  }
  async function confirm() {
    if (!plan || !queue) return;
    const added = await queue.add(plan.map((set) => set.id));
    if (added && mounted.current) close();
  }
  return (
    <Stack gap="xs">
      <Button
        variant="default"
        fullWidth
        loading={detecting || queue.busy}
        disabled={
          !queue.context || !queue.state || queue.state.status === 'loading' || queue.blocked || Boolean(otherEvent)
        }
        onClick={() => void detect()}
      >
        {t('queue.topEightAutomatic')}
      </Button>
      {error && <Alert color="red">{error}</Alert>}
      <Modal opened={Boolean(plan)} onClose={close} title={t('queue.topEightAutomatic')} centered>
        <Stack gap="md">
          <Text>{t('queue.topEightConfirm')}</Text>
          <Text size="sm" c="dimmed">
            {t('queue.topEightHelp')}
          </Text>
          <ol style={{ margin: 0, paddingInlineStart: '1.5rem', overflowWrap: 'anywhere' }}>
            {plan?.map((set) => (
              <li key={set.id}>
                {set.round}
                {(set.entrantOne || set.entrantTwo) && (
                  <>
                    {set.round && ' · '}
                    {set.entrantOne?.name ?? t('selector.tbd')} {t('common:match.versus')}{' '}
                    {set.entrantTwo?.name ?? t('selector.tbd')}
                  </>
                )}
              </li>
            ))}
          </ol>
          <SimpleGrid cols={2}>
            <Button variant="default" disabled={queue.busy} onClick={close}>
              {t('queue.topEightNo')}
            </Button>
            <Button
              loading={queue.busy}
              disabled={queue.blocked || queue.state?.status === 'loading' || Boolean(otherEvent)}
              onClick={() => void confirm()}
            >
              {t('queue.topEightYes')}
            </Button>
          </SimpleGrid>
        </Stack>
      </Modal>
    </Stack>
  );
}
