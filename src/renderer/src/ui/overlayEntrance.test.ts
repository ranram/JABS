// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountHook, mountView } from '../hooks/hookTestHarness';
import { createTestOverlayState, createTestCustomScoreboard } from '@shared/testFixtures';
import { trackObsSourceActivity } from '../hooks/obsSourceActivity';
import { useOverlayEntrance } from './useOverlayEntrance';
import { scoreboardEntrance } from './scoreboardEntrance';
import { CustomScoreboardCanvas } from './CustomScoreboardCanvas';

const animate = vi.hoisted(() =>
  vi.fn(() => ({ revert: vi.fn(), animations: [] as { finished: Promise<unknown> }[] }))
);
vi.mock('animejs/waapi', () => ({ waapi: { animate } }));

const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
let stopTracking: (() => void) | undefined;
afterEach(() => {
  stopTracking?.();
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

let motion: MediaQueryList;
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: vi.fn() });
  stopTracking = trackObsSourceActivity();
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  vi.spyOn(window, 'matchMedia').mockReturnValue(motion);
});

async function activate(active: boolean) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('obsSourceActiveChanged', { detail: { active } }));
  });
}

it('replays on result or Program activation while respecting reduced motion and operator edits', async () => {
  // OBS can become inactive before React has loaded the match.
  await activate(false);
  let ready = false;
  let enabled = true;
  let name = 'あいう/ABC';
  let presentationKey = 'first-result';
  const view = await mountHook(
    () => useOverlayEntrance(scoreboardEntrance, enabled, ready, presentationKey),
    true,
    (ref) => h('main', { ref }, h('div', { 'data-entrance': 'player-left' }, name))
  );
  expect(animate).not.toHaveBeenCalled();
  await act(async () => {
    window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: true } }));
  });
  expect(animate).not.toHaveBeenCalled();
  await activate(true);
  expect(view.container.querySelector('[data-entrance-pending]')).not.toBeNull();
  await activate(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(animate).not.toHaveBeenCalled();
  expect(view.container.querySelector('[data-entrance-pending]')).toBeNull();
  ready = true;
  await view.rerender();
  await activate(true);
  expect(animate).toHaveBeenCalledTimes(1);
  const previousResult = animate.mock.results[0].value;
  presentationKey = 'next-result';
  await view.rerender();
  expect(previousResult.revert).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(2);
  animate.mockClear();
  // Keep the remaining lifecycle checks independent of the result-key replay.
  await activate(false);
  await activate(true);
  name = 'Next player';
  await view.rerender();
  await activate(true);
  expect(animate).toHaveBeenCalledTimes(1);
  const first = animate.mock.results[0].value;
  await activate(false);
  expect(first.revert).toHaveBeenCalledOnce();
  await activate(true);
  expect(animate).toHaveBeenCalledTimes(2);
  const second = animate.mock.results[1].value;
  Object.defineProperty(motion, 'matches', { configurable: true, value: true });
  await act(async () => {
    motion.dispatchEvent(new Event('change'));
  });
  expect(second.revert).toHaveBeenCalledOnce();
  await activate(false);
  await activate(true);
  expect(animate).toHaveBeenCalledTimes(2);
  Object.defineProperty(motion, 'matches', { configurable: true, value: false });
  enabled = false; // Operator previews keep their editing surface still.
  await view.rerender();
  await activate(false);
  await activate(true);
  expect(animate).toHaveBeenCalledTimes(2);
  await view.unmount();
});

it('cancels the previous animation when OBS activation changes rapidly', async () => {
  const rapid = await mountHook(
    () => useOverlayEntrance(scoreboardEntrance, true),
    true,
    (ref) => h('main', { ref }, h('div', { 'data-entrance': 'player-left' }))
  );
  const beforeSwitch = animate.mock.calls.length;
  const interrupted = animate.mock.results.at(-1)!.value;
  await act(async () => {
    window.dispatchEvent(new CustomEvent('obsSourceActiveChanged', { detail: { active: false } }));
    window.dispatchEvent(new CustomEvent('obsSourceActiveChanged', { detail: { active: true } }));
  });
  expect(interrupted.revert).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(beforeSwitch + 1);
  await rapid.unmount();
});

it('enters after a cold load and again when Preview first becomes Program', async () => {
  const beforeColdLoad = animate.mock.calls.length;
  let ready = false;

  const cold = await mountHook(
    () => useOverlayEntrance(scoreboardEntrance, true, ready),
    true,
    (ref) => h('main', { ref }, h('div', { 'data-entrance': 'player-left' }))
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(animate).toHaveBeenCalledTimes(beforeColdLoad + 1);
  expect(cold.container.querySelector('[data-entrance-pending]')).toBeNull();
  const entrance = animate.mock.results.at(-1)!.value;
  ready = true;
  await cold.rerender();
  expect(entrance.revert).not.toHaveBeenCalled();
  expect(animate).toHaveBeenCalledTimes(beforeColdLoad + 1);
  Object.defineProperty(motion, 'matches', { configurable: true, value: true });
  await act(async () => motion.dispatchEvent(new Event('change')));
  expect(entrance.revert).toHaveBeenCalledOnce();
  Object.defineProperty(motion, 'matches', { configurable: true, value: false });
  // A page first loaded in Preview must still enter when its first Program event arrives.
  await activate(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(animate).toHaveBeenCalledTimes(beforeColdLoad + 2);
  const last = animate.mock.results.at(-1)!.value;
  await cold.unmount();
  expect(last.revert).toHaveBeenCalledOnce();
});

it('animates custom scoreboard elements only on activation rather than score edits', async () => {
  const scoreboard = createTestCustomScoreboard({ id: 'custom-test' });
  scoreboard.visibility.flags = false;
  let selectedSet = createTestOverlayState().selectedSet;
  let animateEntrance = false;
  const beforeCustom = animate.mock.calls.length;
  const custom = await mountView(() =>
    h(CustomScoreboardCanvas, {
      scoreboard,
      frameUrl: 'data:image/png;base64,frame',
      selectedSet,
      animateEntrance
    })
  );
  expect(animate).toHaveBeenCalledTimes(beforeCustom);
  animateEntrance = true;
  await custom.rerender();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  const customCalls = animate.mock.calls.slice(beforeCustom) as unknown as [HTMLElement][];
  expect(customCalls.map(([target]) => target.dataset.entrance)).toEqual(
    expect.arrayContaining([
      'custom-frame',
      'playerOneName',
      'playerTwoName',
      'playerOneScore',
      'playerTwoScore',
      'matchLabel',
      'infoCenter'
    ])
  );
  const afterCustom = animate.mock.calls.length;
  selectedSet = { ...selectedSet, playerOne: { ...selectedSet.playerOne, score: 1 } };
  await custom.rerender();
  expect(animate).toHaveBeenCalledTimes(afterCustom);
  await activate(false);
  await activate(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(animate.mock.calls.length).toBeGreaterThan(afterCustom);
  await custom.unmount();
});
