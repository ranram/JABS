// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { StartggGateway } from '@shared/startggGateway';
import { mountHook } from '../../hooks/hookTestHarness';
import { useBracketBrowser } from './useBracketBrowser';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { vi.useRealTimers(); });
const pageInfo = { page: 1, totalPages: 1, total: 0, perPage: 20 };
const scope = { type: 'event' as const, eventId: '1' };

it('refreshes stream assignments with sets and reports queue failure without discarding loaded data', async () => {
  const sets = vi.fn().mockResolvedValue({ source: 'live', sets: [{ id: '1' }], pageInfo });
  const assignment = { setId: '1', streamName: 'Main', queuePosition: 1 };
  const streamQueue = vi.fn().mockResolvedValue({ source: 'live', assignments: [assignment] });
  const setMessage = vi.fn();
  const hook = await mountHook(() => useBracketBrowser({ startgg: { sets, streamQueue } as unknown as StartggGateway,
    setMessage, setLoading: vi.fn(), setTokenVerified: vi.fn() }));
  await act(async () => hook.current.actions.setTournamentSlug('tournament'));
  await act(async () => hook.current.actions.loadSets(scope));
  expect(streamQueue).toHaveBeenCalledWith('tournament');
  expect(hook.current.state.streamAssignments).toEqual([assignment]);
  streamQueue.mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => hook.current.actions.loadSets(scope));
  expect(hook.current.state.sets).toEqual([{ id: '1' }]);
  expect(hook.current.state.streamAssignments).toEqual([assignment]);
  expect(setMessage).toHaveBeenLastCalledWith(expect.stringContaining('selector.streamRefreshFailed'), 'warning');
});

it('clears stream state on context changes but preserves it on refresh and failed transitions', async () => {
  const onContextChange = vi.fn().mockResolvedValue(undefined);
  const events = vi.fn().mockResolvedValue({ source: 'live', events: [{ id: '1', name: 'One' }, { id: '2', name: 'Two' }] });
  const startgg = { events, phases: vi.fn().mockResolvedValue({ source: 'live', phases: [] }),
    sets: vi.fn().mockResolvedValue({ source: 'live', sets: [], pageInfo }),
    streamQueue: vi.fn().mockResolvedValue({ source: 'live', assignments: [] }) };
  const hook = await mountHook(() => useBracketBrowser({ startgg: startgg as unknown as StartggGateway, onContextChange,
    setMessage: vi.fn(), setLoading: vi.fn(), setTokenVerified: vi.fn() }));
  await act(async () => hook.current.actions.loadEvents('first'));
  expect(onContextChange).toHaveBeenCalledTimes(1);
  await act(async () => hook.current.actions.selectEvent('2'));
  expect(onContextChange).toHaveBeenCalledTimes(2);
  await act(async () => hook.current.actions.loadEvents('first'));
  expect(hook.current.state.selectedEventId).toBe('2');
  await act(async () => hook.current.actions.selectEvent('2'));
  await act(async () => hook.current.actions.loadSets());
  expect(onContextChange).toHaveBeenCalledTimes(2);
  events.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => hook.current.actions.loadEvents('second'));
  expect(onContextChange).toHaveBeenCalledTimes(2);
  expect(hook.current.state.selectedEventId).toBe('2');
  onContextChange.mockRejectedValueOnce(new Error('Reset failed'));
  await act(async () => hook.current.actions.selectEvent('1'));
  expect(hook.current.state.selectedEventId).toBe('2');
  await act(async () => hook.current.actions.loadEvents('second'));
  expect(onContextChange).toHaveBeenCalledTimes(4);
  expect(hook.current.state.selectedEventId).toBe('1');
  await act(async () => hook.current.actions.selectEvent(''));
  expect(onContextChange).toHaveBeenCalledTimes(5);
});
