// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { streamDeckSnapshotSchema, streamDeckTiles, type StreamDeckCommand } from '@shared/streamDeck';
import { createStreamDeckExecutor, type StreamDeckContext } from './streamDeckCommands';
import { useStreamDeck } from './useStreamDeck';
import { mountHook } from '../hooks/hookTestHarness';
import { invokeNative } from '../nativeCommand';

vi.mock('../desktopRuntime', () => ({ isTauriRuntime: () => true }));
vi.mock('../nativeCommand', () => ({ invokeNative: vi.fn(async () => undefined) }));
vi.mock('./streamDeck', () => ({ listenForStreamDeck: vi.fn(async () => () => undefined) }));

function fixture() {
  const context: StreamDeckContext = {
    selectedSet: createTestOverlayState().selectedSet,
    blocked: false,
    selectorAvailable: true,
    openSelector: vi.fn(),
    openPlayers: vi.fn(),
    controls: {
      score: vi.fn(async () => true),
      swap: vi.fn(async () => true),
      reset: vi.fn(async () => true),
      commentators: vi.fn(async () => undefined)
    },
    queue: {
      context: {
        eventId: 'event',
        eventName: 'Singles',
        tournamentSlug: 'local',
        gameId: '2xko',
        preserveStation: false,
        preserveMatchLength: false
      },
      state: {
        context: {
          eventId: 'event',
          eventName: 'Singles',
          tournamentSlug: 'local',
          gameId: '2xko',
          preserveStation: false,
          preserveMatchLength: false
        },
        entries: [1, 2, 3].map((id) => ({
          setId: String(id),
          playerOne: 'A',
          playerTwo: 'B',
          entrantOneId: 'a',
          entrantTwoId: 'b'
        })),
        revision: 1,
        cursor: 1,
        mode: 'manual',
        running: false,
        remainingMs: null,
        status: 'paused',
        delayMinutes: 1
      },
      opened: false,
      busy: false,
      blocked: false,
      open: vi.fn(),
      close: vi.fn(),
      add: vi.fn(),
      hold: vi.fn(),
      act: vi.fn(async () => true)
    },
    confirmation: {
      confirmation: undefined,
      confirmationId: undefined,
      confirm: vi.fn(async () => true),
      cancel: vi.fn(),
      requestRemoteConfirmation: vi.fn((kind, id) => {
        context.confirmation.confirmation = kind;
        context.confirmation.confirmationId = id;
        return true;
      })
    }
  };
  const execute = createStreamDeckExecutor(() => context);
  let serial = 0;
  const command = (action: StreamDeckCommand['action'], patch: Partial<StreamDeckCommand> = {}) => ({
    id: `test-${++serial}`,
    action,
    expiresAt: Date.now() + 10_000,
    expectedVersion: context.selectedSet!.updatedAt,
    queueRevision: context.queue!.state!.revision,
    ...patch
  });
  return { context, execute, command };
}

it('provides four independent tile values and uses existing score limits and stale-state guards', async () => {
  const state = streamDeckSnapshotSchema.parse({
    type: 'state',
    protocol: 1,
    version: 'v1',
    playerOne: { name: 'Alpha', score: 1 },
    playerTwo: { name: 'Beta', score: 2 },
    queue: { revision: 1, status: 'paused', running: false, count: 3, cursor: 1 }
  });
  expect(state.confirmationId).toBeNull();
  expect(streamDeckSnapshotSchema.parse({ ...state, confirmationId: 'active-dialog' }).confirmationId).toBe(
    'active-dialog'
  );
  expect(streamDeckTiles(state)).toEqual([
    { id: 'player-1-name', label: 'Player 1 Name', value: 'Alpha' },
    { id: 'score-p1', label: 'Score p1', value: '1' },
    { id: 'score-p2', label: 'Score p2', value: '2' },
    { id: 'player-2-name', label: 'Player 2 Name', value: 'Beta' }
  ]);
  const { context, execute, command } = fixture();
  context.selectedSet!.playerOne.score = 0;
  expect(await execute(command('score-p1-up'))).toBe('completed');
  expect(context.controls!.score).toHaveBeenCalledExactlyOnceWith('one', 1);
  expect(await execute(command('score-p1-down'))).toBe('blocked');
  context.selectedSet!.playerOne.score = 2;
  expect(await execute(command('score-p1-up'))).toBe('blocked');
  expect(await execute(command('swap-players', { expectedVersion: 'stale' }))).toBe('blocked');
  expect(await execute(command('swap-players', { expiresAt: 0 }))).toBe('blocked');
  context.controls!.swap = vi.fn(async () => false);
  expect(await execute(command('swap-players'))).toBe('failed');
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  expect(await execute(command('swap-players'))).toBe('blocked');
  input.remove();
  context.blocked = true;
  expect(await execute(command('score-p2-up'))).toBe('blocked');
  expect(await execute(command('open-players'))).toBe('completed');
  expect(context.openPlayers).toHaveBeenCalledOnce();
  expect(await execute(command('open-selector'))).toBe('completed');
  expect(context.openSelector).toHaveBeenCalledOnce();
});

it('manually navigates queue modes while respecting boundaries, pending changes and revisions', async () => {
  const { context, execute, command } = fixture();
  for (const mode of ['manual', 'report', 'winner-delay'] as const) {
    context.queue!.state!.mode = mode;
    expect(await execute(command('queue-next'))).toBe('completed');
    expect(await execute(command('queue-previous'))).toBe('completed');
  }
  expect(context.queue!.act).toHaveBeenCalledTimes(6);
  context.queue!.state!.cursor = 0;
  expect(await execute(command('queue-previous'))).toBe('blocked');
  context.queue!.state!.cursor = 2;
  expect(await execute(command('queue-next'))).toBe('blocked');
  expect(await execute(command('queue-next', { queueRevision: 0 }))).toBe('blocked');
  context.queue!.state!.running = true;
  expect(await execute(command('queue-toggle'))).toBe('completed');
  expect(context.queue!.act).toHaveBeenLastCalledWith({ action: 'pause' });
  context.queue!.blocked = true;
  expect(await execute(command('clear-queue'))).toBe('blocked');
});

it('starts fresh queues in every mode and pauses running queues through the existing controls', async () => {
  const { context, execute, command } = fixture();
  for (const mode of ['manual', 'report', 'winner-delay'] as const) {
    context.queue!.state!.mode = mode;
    context.queue!.state!.cursor = null;
    expect(await execute(command('queue-toggle'))).toBe('completed');
    expect(context.queue!.act).toHaveBeenLastCalledWith({ action: 'start' });
  }
  context.queue!.state!.running = true;
  context.queue!.blocked = true;
  expect(await execute(command('queue-toggle'))).toBe('completed');
  expect(context.queue!.act).toHaveBeenLastCalledWith({ action: 'pause' });
  context.queue!.state!.running = false;
  expect(await execute(command('queue-toggle'))).toBe('blocked');
  context.queue!.blocked = false;
  context.queue!.state!.entries = [];
  expect(await execute(command('queue-toggle'))).toBe('blocked');
});

it('binds destructive confirmations to their original request and refuses changed matches', async () => {
  const { context, execute, command } = fixture();
  const clear = command('clear-players');
  expect(await execute(clear)).toBe('confirmation-required');
  expect(context.confirmation.confirm).not.toHaveBeenCalled();
  expect(await execute(command('confirm', { confirmationId: 'other' }))).toBe('blocked');
  expect(await execute(command('confirm', { confirmationId: clear.id }))).toBe('completed');
  expect(context.confirmation.confirm).toHaveBeenCalledOnce();
  expect(await execute(command('confirm', { confirmationId: clear.id }))).toBe('blocked');
  context.confirmation.confirmation = undefined;
  const reset = command('reset-scores');
  expect(await execute(reset)).toBe('confirmation-required');
  context.selectedSet!.updatedAt = 'new-match';
  expect(await execute(command('confirm', { confirmationId: reset.id }))).toBe('blocked');
  expect(context.confirmation.cancel).toHaveBeenCalledOnce();
  context.confirmation.confirmation = undefined;
  const queueClear = command('clear-queue');
  expect(await execute(queueClear)).toBe('confirmation-required');
  expect(await execute(command('cancel', { confirmationId: queueClear.id }))).toBe('completed');
  expect(context.confirmation.cancel).toHaveBeenCalledTimes(2);
});

it('notifies native clients when remote confirmations are dismissed locally or the operator unmounts', async () => {
  const { context } = fixture();
  const mounted = await mountHook(() => useStreamDeck(context));
  for (const id of ['yes-dialog', 'no-dialog']) {
    context.confirmation.confirmation = 'players';
    context.confirmation.confirmationId = id;
    await mounted.rerender();
    expect(invokeNative).not.toHaveBeenCalledWith('stream_deck_confirmation_closed', { id });
    context.confirmation.confirmation = undefined;
    context.confirmation.confirmationId = undefined;
    await mounted.rerender();
    expect(invokeNative).toHaveBeenCalledWith('stream_deck_confirmation_closed', { id });
  }
  context.confirmation.confirmation = 'scores';
  context.confirmation.confirmationId = 'unmounted-dialog';
  await mounted.rerender();
  await mounted.unmount();
  expect(invokeNative).toHaveBeenCalledWith('stream_deck_confirmation_closed', { id: 'unmounted-dialog' });
});

it('blocks during local dialogs and typing but resumes after those guards clear', async () => {
  const { context, execute, command } = fixture();
  context.selectedSet!.playerOne.score = 0;
  context.confirmation.confirmation = 'players';
  expect(await execute(command('score-p1-up'))).toBe('blocked');
  context.confirmation.confirmation = undefined;
  expect(await execute(command('score-p1-up'))).toBe('completed');
  context.blocked = true;
  expect(await execute(command('score-p1-up'))).toBe('blocked');
  context.blocked = false;
  expect(await execute(command('score-p1-up'))).toBe('completed');
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.style.visibility = 'visible';
  dialog.getClientRects = () => [{ width: 100, height: 100 }] as unknown as DOMRectList;
  document.body.append(dialog);
  expect(await execute(command('swap-players'))).toBe('blocked');
  dialog.remove();
  expect(await execute(command('swap-players'))).toBe('completed');
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  expect(await execute(command('score-p1-up'))).toBe('blocked');
  input.blur();
  input.remove();
  expect(await execute(command('score-p1-up'))).toBe('completed');
});

it('plays stingers through shared controls and uses native confirmations to offer setup for missing clips', async () => {
  const { context, execute, command } = fixture();
  const play = vi.fn<() => Promise<'completed' | 'unconfigured'>>(async () => 'completed');
  context.playStinger = play;
  expect(await execute(command('stinger-perfect'))).toBe('completed');
  expect(play).toHaveBeenLastCalledWith('perfect');
  expect(await execute(command('stinger-winner', { expectedVersion: 'stale' }))).toBe('blocked');
  play.mockResolvedValueOnce('unconfigured');
  const request = command('stinger-winner');
  expect(await execute(request)).toBe('confirmation-required');
  expect(context.confirmation.requestRemoteConfirmation).toHaveBeenLastCalledWith('stinger-winner', request.id);
  expect(await execute(command('confirm', { confirmationId: request.id }))).toBe('completed');
  expect(context.confirmation.confirm).toHaveBeenCalledOnce();
});
