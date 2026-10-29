// @vitest-environment happy-dom
import { act, createElement as h, useEffect, useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { matchQueueSchema, type MatchQueue, type QueueContext } from '@shared/matchQueue';
import type { QueueHeartbeat } from '../../matchQueueApi';
import { initializeI18n, i18n } from '../../i18n';
import { deferred, mountView } from '../../hooks/hookTestHarness';
import { MatchQueueWorkspace } from './useMatchQueue';
import { useMatchQueue, useQueuedSets } from './matchQueueContext';
import * as diagnostics from '../../diagnostics';
import { SetSelectorPanel } from './SetSelectorPanel';
import { useBracketBrowser } from './useBracketBrowser';
import { useSetSelectorActions } from './useSetSelectorActions';
import type { StartggGateway } from '@shared/startggGateway';
import type { SetSummary, StartggSetScope } from '@shared/models';
import { MatchQueueControls } from './MatchQueueControls';
import { MatchesMenu } from './MatchesMenu';
import { DashboardSetActions } from './DashboardSetActions';
import { useQuickScoreActions } from './useQuickScoreActions';
import { localizedReadinessReason } from './operatorUtils';

const transport = vi.hoisted(() => ({ load: vi.fn(), action: vi.fn(), add: vi.fn(), heartbeat: vi.fn() }));
vi.mock('../../matchQueueApi', () => ({
  matchQueueApi: {
    current: transport.load,
    action: transport.action,
    add: transport.add,
    heartbeat: transport.heartbeat
  }
}));
vi.mock('../../hooks/useRealtimeState', async () => {
  const { useEffect, useState } = await import('react');
  return {
    useRealtimeState: ({ load }: { load(): Promise<MatchQueue> }) => {
      const [state, setState] = useState<MatchQueue>();
      useEffect(() => {
        void load().then(setState);
      }, [load]);
      return { state, setState, error: undefined };
    }
  };
});
const context: QueueContext = {
  eventId: '456',
  eventName: 'Singles',
  tournamentSlug: 'local',
  gameId: 'street-fighter-6',
  preserveStation: false,
  preserveMatchLength: false
};
let snapshot: MatchQueue;
beforeAll(async () => {
  await initializeI18n();
});
beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  await i18n.changeLanguage('en');
  snapshot = {
    context,
    entries: [1, 2, 3].map((id) => ({
      setId: String(id),
      playerOne: `Player ${id}A`,
      playerTwo: `Player ${id}B`,
      entrantOneId: `${id}a`,
      entrantTwoId: `${id}b`
    })),
    cursor: 0,
    mode: 'winner-delay',
    delayMinutes: 1,
    running: false,
    remainingMs: null,
    revision: 1,
    status: 'paused'
  };
  transport.load.mockImplementation(async () => snapshot);
  transport.heartbeat.mockResolvedValue(undefined);
  transport.action.mockImplementation(async (_revision: number, action: { action: string; order?: string[] }) => {
    if (action.action === 'reorder') {
      const currentId = snapshot.cursor === null ? undefined : snapshot.entries[snapshot.cursor].setId;
      const entries = action.order!.map((id) => snapshot.entries.find((e) => e.setId === id)!);
      snapshot = {
        ...snapshot,
        entries,
        cursor: currentId ? entries.findIndex((entry) => entry.setId === currentId) : null,
        revision: snapshot.revision + 1
      };
    }
    return snapshot;
  });
  transport.add.mockImplementation(async () => ({ ...snapshot, revision: snapshot.revision + 1 }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function Fixture() {
  const queue = useMatchQueue();
  return h(
    'div',
    null,
    h(
      'div',
      { className: 'editor-panel' },
      h('input', { 'aria-label': 'Stream player', defaultValue: 'Keep this draft' })
    ),
    h('button', { onClick: () => void queue?.add('4') }, 'Add set'),
    h(MatchQueueControls)
  );
}
async function mount(liveSetId?: string, children = h(Fixture)) {
  return mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(MatchQueueWorkspace, { context, liveSetId, blocked: false, children })
    )
  );
}
function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label);
  expect(found, label).toBeTruthy();
  return found!;
}

it('allows a TBD set to be added from its actions without sending it to stream', async () => {
  const send = vi.fn();
  function PendingSetActions() {
    const quickScore = useQuickScoreActions({
      startgg: {} as StartggGateway, setLoadGameId: 'street-fighter-6', selectedEventId: '456',
      tournamentSlug: 'local', setMessage() {}, setTokenVerified() {},
      refreshAfterReport: async () => true, readinessReason: localizedReadinessReason
    });
    useEffect(() => quickScore.open({ id: '4', state: '1' }), []);
    return h(DashboardSetActions, { quickScore, reportingEnabled: true, loading: false, characterOptions: [], onSendToStream: send });
  }
  await mount(undefined, h(PendingSetActions));
  const add = button(i18n.t('operator:queue.add'));
  expect(add.disabled).toBe(false);
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('TBD');
  await act(async () => add.click());
  expect(transport.add).toHaveBeenCalledExactlyOnceWith(1, context, '4');
  expect(send).not.toHaveBeenCalled();
});

it('keeps existing consumers connected when the workspace module reloads', async () => {
  const diagnostic = vi.spyOn(diagnostics, 'recordDiagnostic');
  const refreshedPath = './useMatchQueue.tsx?queue-workspace-reload';
  const { MatchQueueWorkspace: RefreshedWorkspace } = await import(refreshedPath);
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(RefreshedWorkspace, {
        context,
        liveSetId: '1',
        blocked: false,
        children: h('div', null, h(Fixture), h(MatchesMenu, { setSelectorDisabled: false, onOpenSetSelector() {} }))
      })
    )
  );
  expect(view.container.querySelector('.match-queue-inset')).not.toBeNull();
  await act(async () => button('Matches▾').click());
  const queueItem = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) =>
    node.textContent?.includes('Queue (3)')
  );
  expect(queueItem).toBeDefined();
  await act(async () => queueItem!.click());
  expect(document.querySelector('[data-testid="queue-entry-1"]')).not.toBeNull();
  expect(diagnostic).not.toHaveBeenCalledWith('queue-context-missing', expect.anything());
  await view.unmount();
  await mountView(() => h(MantineProvider, { env: 'test' }, h(Fixture)));
  expect(diagnostic).toHaveBeenCalledWith('queue-context-missing', { area: 'bracket' });
});
it('adds without opening the queue or replacing the stream draft and protects focused edits', async () => {
  snapshot = { ...snapshot, context: undefined, entries: [], cursor: null, status: 'empty' };
  const view = await mount();
  const input = view.container.querySelector<HTMLInputElement>('input')!;
  const beforeFocus = transport.heartbeat.mock.calls.length;
  await act(async () => input.focus());
  expect(transport.heartbeat).toHaveBeenCalledTimes(beforeFocus + 1);
  expect(transport.heartbeat).toHaveBeenLastCalledWith({
    clientId: expect.any(String),
    eventId: '456',
    busy: true,
    sequence: expect.any(Number),
    preserveStation: false,
    preserveMatchLength: false,
    signal: expect.any(AbortSignal)
  });
  await act(async () => button('Add set').click());
  expect(transport.add).toHaveBeenCalledWith(1, context, '4');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(input.value).toBe('Keep this draft');
  await act(async () => input.blur());
  expect(transport.heartbeat).toHaveBeenLastCalledWith({
    clientId: expect.any(String),
    eventId: '456',
    busy: false,
    sequence: expect.any(Number),
    preserveStation: false,
    preserveMatchLength: false,
    signal: expect.any(AbortSignal)
  });
});
it('starts an unstarted queue from Live Controls and disables Start while running', async () => {
  snapshot = { ...snapshot, cursor: null, mode: 'report' };
  const view = await mount();
  const controls = view.container.querySelector('.match-queue-inset')!;
  const start = button('Start queue');
  expect(start.disabled).toBe(false);
  expect(controls.textContent).not.toContain('Resume');
  transport.action.mockImplementationOnce(async () => {
    snapshot = matchQueueSchema.parse({ ...snapshot, cursor: 0, running: true, status: 'waiting-players', revision: 2 });
    return snapshot;
  });
  await act(async () => start.click());
  expect(transport.action).toHaveBeenCalledExactlyOnceWith(1, { action: 'start' });
  expect(start.disabled).toBe(true);
  expect(controls.textContent).toContain(i18n.t('operator:queue.status.waiting-players'));
  expect([...start.parentElement!.children].map((node) => node.textContent)).toEqual(['Start queue', 'Pause queue']);
  await act(async () => start.click());
  expect(transport.action).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('opens on request, reorders with buttons, and preserves the order after a rejected move', async () => {
  await mount();
  await act(async () => button('Queue (3)').click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('[role=dialog] [draggable=true]')).toBeNull();
  const second = document.querySelector('[data-testid="queue-entry-2"]')!;
  const down = [...second.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Move down')!;
  await act(async () => down.click());
  expect(transport.action).toHaveBeenLastCalledWith(1, { action: 'reorder', order: ['1', '3', '2'] });
  const row = document.querySelector('[data-testid="queue-entry-2"]')!;
  const up = [...row.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Move up')!;
  await act(async () => up.click());
  expect(transport.action).toHaveBeenLastCalledWith(2, { action: 'reorder', order: ['1', '2', '3'] });
  expect(transport.action.mock.calls.every(([, action]) => action.action === 'reorder')).toBe(true);
  transport.action.mockRejectedValueOnce(new Error('Reorder failed'));
  const moveDown = [...row.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Move down')!;
  await act(async () => moveDown.click());
  expect(document.querySelector('.match-queue-announcement')?.textContent).toBe('');
  expect(document.body.textContent).toContain('Reorder failed');
  expect(snapshot.entries.map((entry) => entry.setId)).toEqual(['1', '2', '3']);
});

it('starts after a saved mode change and leaves a paused queue stopped after delay edits or failed saves', async () => {
  await mount('1');
  await act(async () => button('Queue (3)').click());
  const input = (label: string) => {
    const field = [...document.querySelectorAll('label')].find((node) => node.textContent === label)!;
    return document.getElementById(field.htmlFor) as HTMLInputElement;
  };
  const delayed: MatchQueue = { ...snapshot, delayMinutes: 2, revision: 7 };
  transport.action.mockResolvedValueOnce(delayed);
  transport.load.mockResolvedValue(delayed);
  const delay = input('Delay before next match (minutes)');
  await act(async () => {
    delay.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(delay, '2');
    delay.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => delay.blur());
  expect(transport.action).toHaveBeenCalledExactlyOnceWith(1, {
    action: 'settings',
    mode: 'winner-delay',
    delayMinutes: 2
  });
  const chooseReport = async () => {
    await act(async () => input('Advance to next match').click());
    await act(async () => {
      [...document.querySelectorAll<HTMLElement>('[role="option"]')]
        .find((node) => node.textContent === 'After result is reported')!
        .click();
    });
  };
  transport.action.mockRejectedValueOnce(new Error('Settings failed'));
  await chooseReport();
  expect(transport.action).toHaveBeenCalledTimes(2);
  expect(transport.action).toHaveBeenLastCalledWith(7, {
    action: 'settings',
    mode: 'report',
    delayMinutes: 2
  });
  const configured: MatchQueue = { ...delayed, mode: 'report', revision: 9 };
  transport.action.mockResolvedValueOnce(configured).mockResolvedValueOnce({
    ...configured,
    running: true,
    status: 'waiting-report',
    revision: 10
  });
  await chooseReport();
  expect(transport.action).toHaveBeenNthCalledWith(3, 7, {
    action: 'settings',
    mode: 'report',
    delayMinutes: 2
  });
  expect(transport.action).toHaveBeenNthCalledWith(4, 9, { action: 'start' });
  expect(button('Pause queue').disabled).toBe(false);
  expect(
    [...document.querySelectorAll('[role="dialog"] button')].filter((node) => node.textContent === 'Pause queue')
  ).toHaveLength(1);
  await act(async () => i18n.changeLanguage('es-419'));
  expect(button('Pausar cola').disabled).toBe(false);
});

it('pauses from the main modal row and lets earlier and current matches move without replacing the stream', async () => {
  snapshot = { ...snapshot, cursor: 1, running: true, status: 'countdown', remainingMs: 30_000 };
  const view = await mount('2');
  await act(async () => button('Queue (3)').click());
  const dialog = document.querySelector('[role="dialog"]')!;
  const pause = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === 'Pause queue'
  )!;
  const actionRow = pause.parentElement!;
  expect([...actionRow.children].map((node) => node.textContent)).toEqual(['Pause queue', 'Clear queue']);
  expect([...dialog.querySelectorAll('button')].filter((node) => node.textContent === 'Pause queue')).toHaveLength(1);
  const moveButton = (id: string, label: string) =>
    dialog.querySelector<HTMLButtonElement>(`[data-testid="queue-entry-${id}"] button[aria-label="${label}"]`)!;
  expect(moveButton('1', 'Move down').disabled).toBe(true);
  expect(moveButton('2', 'Move up').disabled).toBe(true);
  transport.action.mockImplementationOnce(async () => {
    snapshot = { ...snapshot, running: false, status: 'paused', revision: snapshot.revision + 1 };
    return snapshot;
  });
  await act(async () => pause.click());
  expect(transport.action).toHaveBeenLastCalledWith(1, { action: 'pause' });
  expect([...actionRow.children].map((node) => node.textContent)).toEqual(['Start queue', 'Clear queue']);
  const resumeButtons = [...dialog.querySelectorAll<HTMLButtonElement>('button')].filter(
    (node) => node.textContent === 'Resume'
  );
  expect(resumeButtons).toHaveLength(1);
  expect(resumeButtons[0].disabled).toBe(false);
  expect(button('Start queue').disabled).toBe(false);
  expect([...button('Start queue').parentElement!.children].map((node) => node.textContent)).toEqual([
    'Start queue',
    'Resume'
  ]);
  expect(moveButton('1', 'Move down').disabled).toBe(false);
  expect(moveButton('2', 'Move up').disabled).toBe(false);
  await act(async () => moveButton('2', 'Move up').click());
  expect(transport.action).toHaveBeenLastCalledWith(2, { action: 'reorder', order: ['2', '1', '3'] });
  expect(dialog.querySelector('[data-current=true]')?.getAttribute('data-testid')).toBe('queue-entry-2');
  expect(dialog.querySelector('[data-up-next=true]')?.getAttribute('data-testid')).toBe('queue-entry-1');
  await act(async () => moveButton('1', 'Move up').click());
  expect(snapshot.entries.map((entry) => entry.setId)).toEqual(['1', '2', '3']);
  expect(snapshot.cursor).toBe(1);
  expect(snapshot.running).toBe(false);
  expect(view.container.querySelector<HTMLInputElement>('input')!.value).toBe('Keep this draft');
  const revision = snapshot.revision;
  transport.action.mockImplementationOnce(async () => {
    snapshot = { ...snapshot, running: true, status: 'countdown', revision: revision + 1 };
    return snapshot;
  });
  await act(async () => resumeButtons[0].click());
  expect(transport.action).toHaveBeenLastCalledWith(revision, { action: 'resume' });
  expect([...actionRow.children].map((node) => node.textContent)).toEqual(['Pause queue', 'Clear queue']);
  expect([...dialog.querySelectorAll('button')].filter((node) => node.textContent === 'Pause queue')).toHaveLength(1);
  expect([...dialog.querySelectorAll('button')].filter((node) => node.textContent === 'Resume')).toHaveLength(0);
  expect(
    [...view.container.querySelectorAll('.match-queue-inset button')].filter((node) => node.textContent === 'Pause queue')
  ).toHaveLength(1);
});

it.each([false, true])(
  'shows results independently of the current and upcoming positions when running=%s',
  async (running) => {
    snapshot = {
      ...snapshot,
      cursor: running ? 1 : null,
      running,
      mode: 'report',
      status: running ? 'waiting-report' : 'paused'
    };
    snapshot.entries[0].resultStatus = 'completed';
    snapshot.entries[1].resultStatus = 'reported';
    await mount('2');
    await act(async () => button('Queue (3)').click());
    const completed = document.querySelector('[data-testid="queue-entry-1"]')!;
    const current = document.querySelector('[data-testid="queue-entry-2"]')!;
    const upcoming = document.querySelector('[data-testid="queue-entry-3"]')!;
    expect(completed.textContent).toContain('Completed');
    expect(current.textContent).toContain('Current');
    expect(current.textContent).toContain('Reported');
    expect(upcoming.textContent).toContain('Up next');
    expect(completed.textContent).not.toContain('Up next');
    expect(current.textContent).not.toContain('Up next');
    const actions = [...current.querySelectorAll('.match-queue-actions button')];
    expect(actions.map((action) => action.getAttribute('aria-label'))).toEqual([
      'Move up',
      'Move down',
      'Send to stream',
      'Remove'
    ]);
    expect(actions.every((action) => !action.textContent?.trim())).toBe(true);
    await act(async () => i18n.changeLanguage('es-419'));
    expect(current.textContent).toContain('Actual');
    expect(current.textContent).toContain('Reportado');
  }
);
it('shows the winner-delay explanation and translates the queue controls into Spanish', async () => {
  snapshot = { ...snapshot, entries: snapshot.entries.slice(0, 1) };
  await mount();
  await act(async () => button('Queue (1)').click());
  expect(document.body.textContent).toContain('1 match');
  expect(document.body.textContent).not.toContain('1 matches');
  expect(document.body.textContent).toContain(
    'The queue waits the chosen number of minutes after the current set has a winner'
  );
  await act(async () => i18n.changeLanguage('es-419'));
  expect(document.body.textContent).toContain('Cola de partidas');
  expect(document.body.textContent).toContain('1 partida');
  expect(document.body.textContent).not.toContain('1 partidas');
  expect(document.querySelector('.match-queue-inset')?.textContent).toContain('Player 1A vs. Player 1B');
  expect(document.body.textContent).toContain(
    'La cola espera los minutos elegidos desde que la partida actual tiene un ganador'
  );
  expect(button('Siguiente partida')).toBeTruthy();
});

it('uses the latest heartbeat result and aborts pending heartbeats on unmount', async () => {
  const heartbeats: Array<{ request: ReturnType<typeof deferred<void>>; signal: AbortSignal }> = [];
  transport.heartbeat.mockImplementation(({ signal }: QueueHeartbeat) => {
    const request = deferred<void>();
    if (!signal) throw new Error('Missing heartbeat cancellation signal');
    signal.addEventListener('abort', () => request.reject(new Error('Heartbeat timed out')));
    heartbeats.push({ request, signal });
    return request.promise;
  });
  const view = await mount();
  expect(heartbeats).toHaveLength(1);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(heartbeats).toHaveLength(2);
  await act(async () => heartbeats.at(-1)!.request.resolve());
  await act(async () => {
    for (const heartbeat of heartbeats.slice(0, -1)) heartbeat.request.reject(new Error('Old connection failure'));
  });
  expect(button('Next match').disabled).toBe(false);

  const initialCount = heartbeats.length;
  await act(async () => view.container.querySelector<HTMLInputElement>('input')!.focus());
  expect(heartbeats).toHaveLength(initialCount + 1);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  const newer = heartbeats.slice(initialCount);
  expect(newer.length).toBeGreaterThan(1);
  await act(async () => newer.at(-1)!.request.reject(new Error('Connection lost')));
  await act(async () => {
    for (const heartbeat of newer.slice(0, -1)) heartbeat.request.resolve();
  });
  expect(button('Next match').disabled).toBe(true);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  await act(async () => heartbeats.at(-1)!.request.resolve());
  expect(button('Next match').disabled).toBe(false);
  // A timeout must still report failure while a later interval request is pending.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(button('Next match').disabled).toBe(true);
  const pending = heartbeats.at(-1)!;
  expect(pending.signal.aborted).toBe(false);
  await view.unmount();
  expect(pending.signal.aborted).toBe(true);
  await act(async () => pending.request.resolve());
});

it('filters queued sets in queue order, follows reorders, and combines with status filters', async () => {
  const sets = [3, 4, 1, 2].map((id) => ({ id: String(id), state: id === 1 ? '3' : '1' }));
  const loadSearchCatalog = vi.fn();
  const openSet = vi.fn();
  function SelectorFixture() {
    const queue = useMatchQueue();
    return h(
      'div',
      null,
      h(
        'button',
        { onClick: () => void queue?.act({ action: 'reorder', order: ['1', '3', '2'] }) },
        'Reorder upcoming'
      ),
      h(SetSelectorPanel, {
        sets,
        visibleSets: sets,
        assignments: [],
        scope: { type: 'event', eventId: context.eventId },
        scopeLabel: 'Singles',
        search: '',
        searchLoading: false,
        searchCatalogIsCurrent: false,
        selectedEvent: true,
        draftDirty: false,
        modalOpen: false,
        loading: false,
        loadingMore: false,
        onSearchFocus() {},
        onLoadCatalog: loadSearchCatalog,
        onSearchChange() {},
        onCancelSearch() {},
        onOpenSet: openSet,
        onLoadMore() {}
      })
    );
  }
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(MatchQueueWorkspace, { context, blocked: false, children: h(SelectorFixture) })
    )
  );
  const ids = () => [...view.container.querySelectorAll('.set-row')].map((node) => node.getAttribute('data-testid'));
  const toggle = async (label: string) => {
    const chip = [...view.container.querySelectorAll<HTMLLabelElement>('.mantine-Chip-label')].find(
      (node) => node.textContent === label
    )!;
    expect(chip).toBeTruthy();
    await act(async () => chip.click());
  };
  expect(ids()).toEqual(['set-3', 'set-4', 'set-1', 'set-2']);
  await toggle('Queued');
  expect(ids()).toEqual(['set-1', 'set-2', 'set-3']);
  expect(loadSearchCatalog).toHaveBeenCalledOnce();
  expect(openSet).not.toHaveBeenCalled();
  expect(transport.action).not.toHaveBeenCalled();
  await act(async () => button('Reorder upcoming').click());
  expect(ids()).toEqual(['set-1', 'set-3', 'set-2']);
  await toggle('Pending');
  expect(ids()).toEqual(['set-3', 'set-2']);
  await toggle('Queued');
  expect(ids()).toEqual(['set-3', 'set-4', 'set-2']);
  expect(sets.map((set) => set.id)).toEqual(['3', '4', '1', '2']);
});

it('keeps queue membership subscribers unchanged during countdowns but updates them after reordering', async () => {
  let renders = 0;
  let ids: string[] = [];
  function Membership() {
    const listing = useQueuedSets();
    renders++;
    ids = [...(listing?.positions.keys() ?? [])];
    return null;
  }
  function Controls() {
    const queue = useMatchQueue();
    return h('button', { onClick: () => void queue?.act({ action: 'resume' }) }, 'Emit snapshot');
  }
  await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(MatchQueueWorkspace, {
        context,
        blocked: false,
        children: h('div', null, h(Membership), h(Controls))
      })
    )
  );
  const initialRenders = renders;
  snapshot = {
    ...snapshot,
    entries: snapshot.entries.map((entry) => ({ ...entry })),
    running: true,
    status: 'countdown',
    remainingMs: 59_000
  };
  await act(async () => button('Emit snapshot').click());
  expect(renders).toBe(initialRenders);
  expect(ids).toEqual(['1', '2', '3']);
  snapshot = { ...snapshot, entries: [snapshot.entries[0], snapshot.entries[2], snapshot.entries[1]] };
  await act(async () => button('Emit snapshot').click());
  expect(ids).toEqual(['1', '3', '2']);
  expect(renders).toBe(initialRenders + 1);
});

it('loads off-page queued matches with an empty search, reuses the catalog, and respects the current scope', async () => {
  const scope: StartggSetScope = { type: 'event', eventId: context.eventId };
  const pageSets: SetSummary[] = [3, 2, 1].map((id) => ({ id: String(id), state: id === 2 ? '3' : '1' }));
  const requests = vi.fn(async (requested: StartggSetScope, page = 1) => ({
    source: 'live',
    sets: requested.type === 'event' ? [pageSets[page - 1]] : [pageSets[0]],
    pageInfo: {
      page,
      totalPages: requested.type === 'event' ? 3 : 1,
      total: requested.type === 'event' ? 3 : 1,
      perPage: 1
    }
  }));
  function Browser() {
    const [loading, setLoading] = useState(false);
    const browser = useBracketBrowser({
      startgg: { sets: requests } as unknown as StartggGateway,
      setLoading,
      setMessage() {},
      setTokenVerified() {}
    });
    const { state, actions } = browser;
    const selector = useSetSelectorActions({
      open() {},
      completeSearch: actions.ensureCompleteSetSearchCatalog,
      loadMore: actions.loadMoreSets,
      search: state.setSearch,
      setSearch: actions.setSetSearch
    });
    useEffect(() => {
      void actions.loadSets(scope);
    }, []);
    return h(
      'div',
      null,
      h(
        'button',
        {
          onClick: () => void actions.loadSets({ type: 'phaseGroup', eventId: context.eventId, phaseGroupId: 'pool' })
        },
        'Change pool'
      ),
      h(SetSelectorPanel, {
        sets: state.sets,
        visibleSets: state.sets,
        catalogSets: state.searchCatalogIsCurrent ? state.setSearchCatalog : undefined,
        onLoadCatalog: selector.loadSetCatalog,
        scope: state.setScope,
        scopeLabel: 'Singles',
        assignments: [],
        pageInfo: state.setPageInfo,
        search: state.setSearch,
        searchLoading: state.setSearchLoading,
        searchProgress: state.setSearchProgress,
        searchCatalogIsCurrent: state.searchCatalogIsCurrent,
        selectedEvent: true,
        draftDirty: false,
        modalOpen: false,
        loading,
        loadingMore: false,
        onSearchFocus: selector.focusSetSearch,
        onSearchChange: selector.changeSetSearch,
        onCancelSearch: actions.cancelSetSearch,
        onOpenSet: selector.openSetFromSelector,
        onLoadMore: selector.loadMoreSetsFromSelector
      })
    );
  }
  const view = await mountView(() =>
    h(MantineProvider, { env: 'test' }, h(MatchQueueWorkspace, { context, blocked: false, children: h(Browser) }))
  );
  const ids = () => [...view.container.querySelectorAll('.set-row')].map((node) => node.getAttribute('data-testid'));
  const queued = () =>
    [...view.container.querySelectorAll<HTMLLabelElement>('.mantine-Chip-label')].find(
      (node) => node.textContent === 'Queued'
    )!;
  expect(ids()).toEqual(['set-3']);
  expect(requests).toHaveBeenCalledTimes(1);
  await act(async () => queued().click());
  expect(ids()).toEqual(['set-1', 'set-2', 'set-3']);
  expect(requests.mock.calls.map(([, page]) => page)).toEqual([1, 1, 2, 3]);
  expect(view.container.querySelector<HTMLInputElement>('[data-testid=set-search]')!.value).toBe('');
  await act(async () => queued().click());
  expect(ids()).toEqual(['set-3']);
  await act(async () => queued().click());
  expect(ids()).toEqual(['set-1', 'set-2', 'set-3']);
  expect(requests).toHaveBeenCalledTimes(4);
  await act(async () => button('Change pool').click());
  await act(async () => queued().click());
  expect(ids()).toEqual(['set-3']);
  expect(requests.mock.calls.at(-1)?.[0]).toEqual({
    type: 'phaseGroup',
    eventId: context.eventId,
    phaseGroupId: 'pool'
  });
});
