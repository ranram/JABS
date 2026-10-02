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

it('dates successful loads, preserves the date on failure and clears it on context changes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  const sets = vi.fn().mockResolvedValue({ source: 'live', sets: [], pageInfo });
  const hook = await mountHook(() => useBracketBrowser({ startgg: { sets } as unknown as StartggGateway,
    setMessage: vi.fn(), setLoading: vi.fn(), setTokenVerified: vi.fn() }));
  await act(async () => hook.current.loadSets(scope));
  expect(hook.current.bracketRefresh).toEqual({ source: 'live', at: '2026-10-01T12:00:00.000Z' });
  vi.setSystemTime(new Date('2026-10-01T13:00:00Z'));
  sets.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => hook.current.loadSets(scope));
  expect(hook.current.bracketRefresh?.at).toBe('2026-10-01T12:00:00.000Z');
  sets.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => hook.current.loadSets({ type: 'event', eventId: '2' }));
  expect(hook.current.bracketRefresh).toBeUndefined();
  await act(async () => hook.current.loadSets(scope));
  await act(async () => hook.current.unloadTournament());
  expect(hook.current.bracketRefresh).toBeUndefined();
});

it('refreshes stream assignments with sets and reports queue failure without discarding loaded data', async () => {
  const sets = vi.fn().mockResolvedValue({ source: 'live', sets: [{ id: '1' }], pageInfo });
  const assignment = { setId: '1', streamName: 'Main', queuePosition: 1 };
  const streamQueue = vi.fn().mockResolvedValue({ source: 'live', assignments: [assignment] });
  const setMessage = vi.fn();
  const hook = await mountHook(() => useBracketBrowser({ startgg: { sets, streamQueue } as unknown as StartggGateway,
    setMessage, setLoading: vi.fn(), setTokenVerified: vi.fn() }));
  await act(async () => hook.current.setTournamentSlug('tournament'));
  await act(async () => hook.current.loadSets(scope));
  expect(streamQueue).toHaveBeenCalledWith('tournament');
  expect(hook.current.streamAssignments).toEqual([assignment]);
  streamQueue.mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => hook.current.loadSets(scope));
  expect(hook.current.sets).toEqual([{ id: '1' }]);
  expect(hook.current.streamAssignments).toEqual([assignment]);
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
  await act(async () => hook.current.loadEvents('first'));
  expect(onContextChange).toHaveBeenCalledTimes(1);
  await act(async () => hook.current.selectEvent('2'));
  expect(onContextChange).toHaveBeenCalledTimes(2);
  await act(async () => hook.current.loadEvents('first'));
  expect(hook.current.selectedEventId).toBe('2');
  await act(async () => hook.current.selectEvent('2'));
  await act(async () => hook.current.loadSets());
  expect(onContextChange).toHaveBeenCalledTimes(2);
  events.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => hook.current.loadEvents('second'));
  expect(onContextChange).toHaveBeenCalledTimes(2);
  expect(hook.current.selectedEventId).toBe('2');
  onContextChange.mockRejectedValueOnce(new Error('Reset failed'));
  await act(async () => hook.current.selectEvent('1'));
  expect(hook.current.selectedEventId).toBe('2');
  await act(async () => hook.current.loadEvents('second'));
  expect(onContextChange).toHaveBeenCalledTimes(4);
  expect(hook.current.selectedEventId).toBe('1');
  await act(async () => hook.current.selectEvent(''));
  expect(onContextChange).toHaveBeenCalledTimes(5);
});
