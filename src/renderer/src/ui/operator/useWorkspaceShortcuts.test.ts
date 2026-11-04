// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { initializeI18n } from '../../i18n';
import { ShortcutConfirmation } from './ShortcutConfirmation';
import { afterEach, expect, it, vi } from 'vitest';
import { mountView, mountHook } from '../../hooks/hookTestHarness';
import type { QueueController } from './matchQueueContext';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';
import { setTutorialActive } from '../tutorials/tutorialActivity';

const context = {
  eventId: 'event',
  eventName: 'Singles',
  tournamentSlug: 'local',
  gameId: '2xko',
  preserveStation: false,
  preserveMatchLength: false
};
function controller(): QueueController {
  return {
    context,
    opened: false,
    busy: false,
    blocked: false,
    state: {
      context,
      entries: [1, 2, 3].map((id) => ({
        setId: String(id),
        playerOne: 'A',
        playerTwo: 'B',
        entrantOneId: 'a',
        entrantTwoId: 'b'
      })),
      cursor: 1,
      mode: 'manual',
      delayMinutes: 1,
      running: false,
      remainingMs: null,
      revision: 1,
      status: 'paused'
    },
    open: vi.fn(),
    close: vi.fn(),
    add: vi.fn(),
    act: vi.fn(async () => true),
    hold: vi.fn()
  };
}
function press(code: string, extra: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', {
    code,
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    ...extra
  });
  target.dispatchEvent(event);
  return event;
}
afterEach(() => {
  vi.restoreAllMocks();
  setTutorialActive(false);
});

it('opens workspaces and manually navigates every queue mode, respecting current position and queue boundaries', async () => {
  const queue = controller();
  const onOpenSelector = vi.fn();
  const options = { enabled: true, navigationBlocked: false, selectorAvailable: true, onOpenSelector, queue };
  const hook = await mountHook(() => useWorkspaceShortcuts(options), true);
  await act(async () => {
    expect(press('KeyQ').defaultPrevented).toBe(true);
    expect(press('KeyE').defaultPrevented).toBe(true);
  });
  expect(queue.open).toHaveBeenCalledOnce();
  expect(onOpenSelector).toHaveBeenCalledOnce();
  for (const mode of ['manual', 'report', 'winner-delay'] as const) {
    queue.state = {
      ...queue.state!,
      mode,
      running: mode !== 'manual',
      status: mode === 'winner-delay' ? 'countdown' : 'waiting-report'
    };
    await hook.rerender();
    await act(async () => {
      press('KeyN');
      press('KeyP');
    });
    expect(queue.act).toHaveBeenLastCalledWith({ action: 'previous' });
  }
  expect(queue.act).toHaveBeenCalledTimes(6);
  queue.state!.cursor = 0;
  expect(press('KeyP').defaultPrevented).toBe(false);
  queue.state!.cursor = 2;
  expect(press('KeyN').defaultPrevented).toBe(false);
  queue.state!.cursor = null;
  queue.liveSetId = '2';
  await hook.rerender();
  await act(async () => press('KeyN'));
  expect(queue.act).toHaveBeenLastCalledWith({ action: 'next' });
  queue.state!.entries = [];
  expect(press('KeyN').defaultPrevented).toBe(false);
  await hook.unmount();
  press('KeyQ');
  expect(queue.open).toHaveBeenCalledOnce();
});

it('opens Players, queue and selector while editing without allowing match changes from the focused field', async () => {
  const queue = controller();
  const onOpenSelector = vi.fn();
  const onClearPlayers = vi.fn();
  const onOpenPlayers = vi.fn();
  const hook = await mountHook(() =>
    useWorkspaceShortcuts({
      enabled: true,
      navigationBlocked: true,
      selectorAvailable: true,
      onOpenSelector,
      onOpenPlayers,
      onClearPlayers,
      queue
    })
  );
  const input = document.createElement('input');
  document.body.append(input);
  input.value = 'Unfinished player name';
  input.addEventListener('keydown', (event) => event.stopPropagation());
  input.focus();
  try {
    await act(async () => {
      expect(press('KeyQ', {}, input).defaultPrevented).toBe(true);
      expect(press('KeyE', {}, input).defaultPrevented).toBe(true);
      for (const code of ['KeyN', 'KeyP', 'Space', 'KeyD', 'KeyX']) {
        expect(press(code, {}, input).defaultPrevented).toBe(false);
      }
    });
    expect(queue.open).toHaveBeenCalledOnce();
    expect(onOpenSelector).toHaveBeenCalledOnce();
    await act(async () => {
      expect(press('', { key: 'F5', ctrlKey: false, shiftKey: false }, input).defaultPrevented).toBe(true);
      expect(press('Unidentified', { key: 'F6', ctrlKey: false, shiftKey: false }, input).defaultPrevented).toBe(true);
      expect(press('F7', { ctrlKey: false, shiftKey: false }, input).defaultPrevented).toBe(true);
    });
    expect(onOpenPlayers).toHaveBeenCalledOnce();
    expect(press('F5', { ctrlKey: false, shiftKey: false, repeat: true }, input).defaultPrevented).toBe(true);
    expect(onOpenPlayers).toHaveBeenCalledOnce();
    expect(queue.open).toHaveBeenCalledTimes(2);
    expect(onOpenSelector).toHaveBeenCalledTimes(2);
    expect(queue.act).not.toHaveBeenCalled();
    expect(onClearPlayers).not.toHaveBeenCalled();
    expect(hook.current.confirmation).toBeUndefined();
    expect(input.value).toBe('Unfinished player name');
  } finally {
    input.remove();
    await hook.unmount();
  }
});

it('keeps edit guards and ignores repeats, typing and unrelated dialogs while allowing navigation from the queue', async () => {
  const queue = controller();
  const options = { enabled: true, navigationBlocked: false, selectorAvailable: true, onOpenSelector: vi.fn(), queue };
  const hook = await mountHook(() => useWorkspaceShortcuts(options));
  for (const extra of [
    { ctrlKey: false },
    { shiftKey: false },
    { altKey: true },
    { metaKey: true },
    { repeat: true },
    { isComposing: true }
  ])
    press('KeyN', extra);
  const input = document.createElement('input');
  document.body.append(input);
  press('KeyN', {}, input);
  input.remove();
  setTutorialActive(true);
  press('KeyN');
  setTutorialActive(false);
  options.enabled = false;
  await hook.rerender();
  press('KeyN');
  options.enabled = true;
  for (const block of ['edit', 'busy', 'blocked', 'event', 'loading']) {
    options.navigationBlocked = block === 'edit';
    queue.busy = block === 'busy';
    queue.blocked = block === 'blocked';
    queue.context = { ...context, eventId: block === 'event' ? 'other' : 'event' };
    queue.state!.status = block === 'loading' ? 'loading' : 'paused';
    await hook.rerender();
    press('KeyN');
  }
  queue.state!.status = 'paused';
  await hook.rerender();
  expect(queue.act).not.toHaveBeenCalled();
  const popup = document.createElement('div');
  popup.setAttribute('role', 'dialog');
  popup.style.visibility = 'visible';
  document.body.append(popup);
  vi.spyOn(popup, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  try {
    press('KeyN');
    expect(queue.act).not.toHaveBeenCalled();
    popup.innerHTML = '<div data-tutorial="queue-panel"></div>';
    await act(async () => press('KeyN'));
    expect(queue.act).toHaveBeenCalledExactlyOnceWith({ action: 'next' });
    popup.innerHTML = '<div data-tutorial="set-selector"></div>';
    await act(async () => press('KeyP'));
    expect(queue.act).toHaveBeenLastCalledWith({ action: 'previous' });
  } finally {
    popup.remove();
  }
  options.selectorAvailable = false;
  await hook.rerender();
  press('KeyE');
  expect(options.onOpenSelector).not.toHaveBeenCalled();
});

it('pauses immediately and resumes only an initialized automatic queue with no pending edits', async () => {
  const queue = controller();
  const options = { enabled: true, navigationBlocked: false, selectorAvailable: false, onOpenSelector: vi.fn(), queue };
  const hook = await mountHook(() => useWorkspaceShortcuts(options));
  expect(press('Space').defaultPrevented).toBe(false);
  queue.state = { ...queue.state!, mode: 'winner-delay', running: true, status: 'countdown' };
  options.navigationBlocked = true;
  queue.blocked = true;
  await hook.rerender();
  await act(async () => press('Space'));
  expect(queue.act).toHaveBeenCalledExactlyOnceWith({ action: 'pause' });
  queue.state.running = false;
  await hook.rerender();
  expect(press('Space').defaultPrevented).toBe(false);
  options.navigationBlocked = false;
  queue.blocked = false;
  await hook.rerender();
  await act(async () => press('Space'));
  expect(queue.act).toHaveBeenLastCalledWith({ action: 'resume' });
  for (const condition of ['busy', 'cursor', 'event', 'loading']) {
    queue.busy = condition === 'busy';
    queue.state.cursor = condition === 'cursor' ? null : 1;
    queue.context = { ...context, eventId: condition === 'event' ? 'other' : context.eventId };
    queue.state.status = condition === 'loading' ? 'loading' : 'paused';
    await hook.rerender();
    expect(press('Space').defaultPrevented).toBe(false);
  }
  expect(queue.act).toHaveBeenCalledTimes(2);
});

it('requires Y/N confirmation for clearing the queue or player details and rejects a changed queue', async () => {
  await initializeI18n();
  const queue = controller();
  const onClearPlayers = vi.fn();
  function Fixture() {
    const confirmation = useWorkspaceShortcuts({
      enabled: true,
      navigationBlocked: false,
      selectorAvailable: false,
      onOpenSelector() {},
      onClearPlayers,
      queue
    });
    return h(
      MantineProvider,
      { env: 'test' },
      h(ShortcutConfirmation, {
        kind: confirmation.confirmation,
        onConfirm: confirmation.confirm,
        onCancel: confirmation.cancel
      })
    );
  }
  const view = await mountView(() => h(Fixture));
  await act(async () => press('KeyD'));
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('Clear every match from the queue?');
  expect(queue.act).not.toHaveBeenCalled();
  expect(queue.hold).toHaveBeenLastCalledWith(true);
  await act(async () => press('KeyN', { ctrlKey: false, shiftKey: false }));
  expect(queue.act).not.toHaveBeenCalled();
  expect(queue.hold).toHaveBeenLastCalledWith(false);
  await act(async () => press('KeyD'));
  await act(async () => press('KeyY', { ctrlKey: false, shiftKey: false }));
  expect(queue.act).toHaveBeenCalledExactlyOnceWith({ action: 'clear' });
  await act(async () => press('KeyD'));
  queue.state!.revision += 1;
  await view.rerender();
  await act(async () => press('KeyY', { ctrlKey: false, shiftKey: false }));
  expect(queue.act).toHaveBeenCalledOnce();
  await act(async () => press('', { key: 'X' }));
  expect(onClearPlayers).not.toHaveBeenCalled();
  await act(async () => press('Escape', { ctrlKey: false, shiftKey: false }));
  expect(onClearPlayers).not.toHaveBeenCalled();
  await act(async () => press('Unidentified', { key: 'x' }));
  await act(async () => press('', { key: 'y', ctrlKey: false, shiftKey: false }));
  expect(onClearPlayers).toHaveBeenCalledOnce();
  await view.unmount();
});
