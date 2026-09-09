import { afterEach, expect, it, vi } from 'vitest';
import type { StartggGateway } from '@shared/startggGateway';
import type { BracketBrowserAction, BracketBrowserState } from './bracketBrowserState';
import { useBracketBrowser } from './useBracketBrowser';

const harness = vi.hoisted(() => ({
  state: undefined as BracketBrowserState | undefined,
  refs: [] as { current: unknown }[], index: 0
}));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => {
    const index = harness.index++;
    return harness.refs[index] ??= { current: value };
  },
  useReducer: (reducer: (state: BracketBrowserState, action: BracketBrowserAction) => BracketBrowserState, initial: BracketBrowserState) => {
    harness.state ??= initial;
    return [harness.state, (action: BracketBrowserAction) => { harness.state = reducer(harness.state!, action); }];
  }
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key })
}));
afterEach(() => { vi.useRealTimers(); harness.state = undefined; harness.refs = []; });

it('dates successful scope loads, preserves the date on failure, identifies cache data, and clears on unload', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  const sets = vi.fn().mockResolvedValue({ source: 'live', sets: [], pageInfo: { page: 1, totalPages: 1, total: 0, perPage: 20 } });
  const render = () => {
    harness.index = 0;
    return useBracketBrowser({ startgg: { sets } as unknown as StartggGateway,
      setMessage: vi.fn(), setLoading: vi.fn(), setTokenVerified: vi.fn() });
  };
  const scope = { type: 'event' as const, eventId: '1' };
  await render().loadSets(scope);
  expect(harness.state?.bracketRefresh).toEqual({ source: 'live', at: '2026-09-07T12:00:00.000Z' });
  vi.setSystemTime(new Date('2026-09-07T13:00:00Z'));
  sets.mockRejectedValueOnce(new Error('Offline'));
  await render().loadSets(scope);
  expect(harness.state?.bracketRefresh?.at).toBe('2026-09-07T12:00:00.000Z');
  sets.mockResolvedValueOnce({ source: 'cache', cachedAt: '2026-09-06T12:00:00Z', sets: [], pageInfo: {} });
  await render().loadSets(scope);
  expect(harness.state?.bracketRefresh).toEqual({ source: 'cache', at: '2026-09-06T12:00:00Z' });
  sets.mockRejectedValueOnce(new Error('Offline'));
  await render().loadSets({ type: 'event', eventId: '2' });
  expect(harness.state?.bracketRefresh).toBeUndefined();
  await render().loadSets(scope);
  render().unloadTournament();
  expect(harness.state?.bracketRefresh).toBeUndefined();
});

it('refreshes stream assignments with sets and keeps loaded sets when the queue fails', async () => {
  const sets = vi.fn().mockResolvedValue({ source: 'live', sets: [{ id: '1' }], pageInfo: { page: 1, totalPages: 1, total: 1, perPage: 20 } });
  const assignment = { setId: '1', streamName: 'Main', queuePosition: 1 };
  const streamQueue = vi.fn().mockResolvedValue({ source: 'live', assignments: [assignment] });
  const setMessage = vi.fn();
  const render = () => {
    harness.index = 0;
    return useBracketBrowser({ startgg: { sets, streamQueue } as unknown as StartggGateway,
      setMessage, setLoading: vi.fn(), setTokenVerified: vi.fn() });
  };
  render();
  harness.state = { ...harness.state!, tournamentSlug: 'tournament' };
  await render().loadSets({ type: 'event', eventId: '1' });
  expect(streamQueue).toHaveBeenCalledWith('tournament');
  expect(harness.state?.streamAssignments).toEqual([assignment]);
  streamQueue.mockRejectedValueOnce(new Error('Unavailable'));
  await render().loadSets({ type: 'event', eventId: '1' });
  expect(harness.state?.sets).toEqual([{ id: '1' }]);
  expect(harness.state?.streamAssignments).toEqual([assignment]);
  expect(setMessage).toHaveBeenLastCalledWith(expect.stringContaining('selector.streamRefreshFailed'));
});

it('clears stream state on context changes, but preserves it on refresh and failed tournament loads', async () => {
  const onContextChange = vi.fn().mockResolvedValue(undefined);
  const events = vi.fn().mockResolvedValue({ source: 'live', events: [{ id: '1', name: 'One' }, { id: '2', name: 'Two' }] });
  const startgg = { events, phases: vi.fn().mockResolvedValue({ source: 'live', phases: [] }),
    sets: vi.fn().mockResolvedValue({ source: 'live', sets: [], pageInfo: {} }),
    streamQueue: vi.fn().mockResolvedValue({ source: 'live', assignments: [] }) };
  const render = () => {
    harness.index = 0;
    return useBracketBrowser({ startgg: startgg as unknown as StartggGateway, onContextChange,
      setMessage: vi.fn(), setLoading: vi.fn(), setTokenVerified: vi.fn() });
  };
  await render().loadEvents('first');
  expect(onContextChange).toHaveBeenCalledTimes(1);
  await render().selectEvent('2');
  expect(onContextChange).toHaveBeenCalledTimes(2);
  await render().loadEvents('first');
  expect(harness.state?.selectedEventId).toBe('2');
  await render().selectEvent('2');
  await render().loadSets();
  expect(onContextChange).toHaveBeenCalledTimes(2);
  events.mockRejectedValueOnce(new Error('Offline'));
  await render().loadEvents('second');
  expect(onContextChange).toHaveBeenCalledTimes(2);
  expect(harness.state?.selectedEventId).toBe('2');
  onContextChange.mockRejectedValueOnce(new Error('Reset failed'));
  await render().selectEvent('1');
  expect(harness.state?.selectedEventId).toBe('2');
  await render().loadEvents('second');
  expect(onContextChange).toHaveBeenCalledTimes(4);
  expect(harness.state?.selectedEventId).toBe('1');
  await render().selectEvent('');
  expect(onContextChange).toHaveBeenCalledTimes(5);
});
