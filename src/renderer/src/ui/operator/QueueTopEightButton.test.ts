// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { expect, it, vi } from 'vitest';
import { createTestTopEightSets } from '@shared/testFixtures';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { MatchQueueContext, type QueueController } from './matchQueueContext';
import { QueueTopEightButton } from './QueueTopEightButton';

vi.mock('../../api', () => ({
  api: {
    phases: async () => ({ phases: [{ id: 'phase', name: 'Top 8' }] }),
    sets: async () => ({ sets: createTestTopEightSets(), pageInfo: { totalPages: 1 } })
  }
}));

function buttonNamed(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((button) => button.textContent === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

it('requires confirmation, preserves queued matches, and includes the exposed reset last', async () => {
  await initializeI18n();
  const add = vi.fn(async () => true);
  const hold = vi.fn();
  const queue: QueueController = {
    context: {
      eventId: 'event',
      eventName: 'Singles',
      tournamentSlug: 'test',
      gameId: 'street-fighter-6',
      preserveStation: false,
      preserveMatchLength: false
    },
    state: {
      entries: [{ setId: 'ws1', playerOne: 'A', playerTwo: 'B', entrantOneId: '1', entrantTwoId: '2' }],
      cursor: null,
      mode: 'manual',
      delayMinutes: 1,
      running: false,
      remainingMs: null,
      revision: 1,
      status: 'paused'
    },
    opened: true,
    busy: false,
    blocked: false,
    add,
    hold,
    open() {},
    close() {},
    act: async () => true
  };
  await mountView(() =>
    h(MantineProvider, { env: 'test' }, h(MatchQueueContext.Provider, { value: queue }, h(QueueTopEightButton)))
  );
  const detect = buttonNamed('Queue Top 8 automatically');
  await act(async () => detect.click());
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('Send all Top 8 matches to the match queue?');
  expect(add).not.toHaveBeenCalled();
  await act(async () => buttonNamed('No, cancel').click());
  expect(add).not.toHaveBeenCalled();
  await act(async () => detect.click());
  await act(async () => buttonNamed('Yes, add matches').click());
  expect(add).toHaveBeenCalledExactlyOnceWith(['ws2', 'lo1', 'lo2', 'q1', 'q2', 'wf', 'ls', 'lf', 'gf', 'reset']);
  expect(hold).toHaveBeenLastCalledWith(false);
});
