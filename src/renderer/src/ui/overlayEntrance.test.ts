// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { initializeI18n } from '../i18n';

import { mountHook, mountView } from '../hooks/hookTestHarness';
import { createTestOverlayState, createTestCustomScoreboard } from '@shared/testFixtures';
import { trackObsSourceActivity } from '../hooks/obsSourceActivity';
import { useOverlayEntrance } from './useOverlayEntrance';
import { scoreboardEntrance } from './scoreboardEntrance';
import { highlightEntrance } from './resultScreen/highlightEntrance';
import { CustomScoreboardCanvas } from './CustomScoreboardCanvas';
import * as appearanceSettings from './appearance/AppearanceProvider';
import { api } from '../api';
import { OverlayView } from './OverlayView';
import * as overlaySource from '../hooks/useOverlayState';
import { AnnouncementOverlay } from './AnnouncementOverlay';
import * as resultSource from '../hooks/useResultScreenState';
import { resultScreenStateSchema } from '@shared/resultScreen';
import { gameProfiles } from '@shared/gameProfiles';

const photoSettings = vi.hoisted(() => ({ enabled: false }));
vi.mock('../hooks/useScoreboardPhotos', () => ({
  useScoreboardPhotos: () => ({
    state: { enabled: photoSettings.enabled, logoBackdrop: false, sponsorBackdrop: false, updatedAt: '1' }
  })
}));

beforeAll(initializeI18n);

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
  photoSettings.enabled = false;
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

it('delays entrances, cancels hidden sources and keeps playing after delay edits', async () => {
  let delay = 1500;
  const useAppearance = appearanceSettings.useAppearance;
  vi.spyOn(appearanceSettings, 'useAppearance').mockImplementation(() => {
    const context = useAppearance();
    return { ...context, appearance: { ...context.appearance, entranceDelayMs: delay } };
  });
  const view = await mountHook(
    () => useOverlayEntrance(scoreboardEntrance, true),
    false,
    (ref) => h('main', { ref }, h('div', { 'data-entrance': 'player-left' }))
  );
  expect(view.container.querySelector('[data-entrance-pending]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(animate).not.toHaveBeenCalled();
  await activate(false);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(animate).not.toHaveBeenCalled();
  expect(view.container.querySelector('[data-entrance-pending]')).toBeNull();
  await activate(true);
  await act(async () => vi.advanceTimersByTimeAsync(1499));
  expect(animate).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(animate).toHaveBeenCalledOnce();
  const running = animate.mock.results[0].value;
  delay = 3000;
  await view.rerender();
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(animate).toHaveBeenCalledOnce();
  expect(running.revert).not.toHaveBeenCalled();
  await view.unmount();
});

it('keeps Highlight entrances smooth and adds brief landing impacts with cleanup', async () => {
  const placement = 'translate3d(96px, 108px, 0) scale(1.5)';
  const effects: { frames: Keyframe[]; options: KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn> }[] = [];
  vi.spyOn(Element.prototype, 'animate').mockImplementation((frames, options) => {
    const cancel = vi.fn();
    effects.push({ frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, cancel });
    return { cancel, finished: new Promise(() => {}) } as unknown as Animation;
  });
  let showTitle = true;
  const view = await mountHook(
    () => useOverlayEntrance(highlightEntrance, true, true, 'winner'),
    false,
    (ref) =>
      h(
        'main',
        { ref },
        h(
          'div',
          { 'data-entrance': 'highlight-stage' },
          h('div', { 'data-entrance': 'victory-photo', style: { transform: placement } }),
          h('div', { 'data-entrance': 'victory-character' }),
          h('div', { 'data-entrance': 'highlight-name' }),
          h('div', { 'data-entrance': 'highlight-title', style: { opacity: showTitle ? 1 : 0 } }),
          h('div', { 'data-entrance': 'highlight-impact' })
        )
      )
  );
  const calls = animate.mock.calls as unknown as [
    HTMLElement,
    { transform: string[]; filter?: unknown; opacity: unknown; duration: number }
  ][];
  expect(calls).toHaveLength(4);
  for (const [, options] of calls.filter(([target]) => target.dataset.entrance?.startsWith('victory-'))) {
    expect(options.transform).toHaveLength(2);
    expect(options.filter).toBeUndefined();
    expect(options.opacity).toBeDefined();
    expect(options.duration).toBeLessThanOrEqual(250);
  }
  const photo = calls.find(([target]) => target.dataset.entrance === 'victory-photo')![1];
  expect(photo.transform.every((frame) => frame.includes(placement))).toBe(true);
  expect(photo.transform.at(-1)).toBe(placement);
  expect(effects).toHaveLength(2);
  const [shake, flash] = effects;
  expect(shake.frames[0].transform).toBe(shake.frames.at(-1)!.transform);
  const duration = Number(shake.options.duration);
  for (const at of [520, 1120, 2000, 2800]) {
    expect(shake.frames.some(({ offset }) => Math.abs(Number(offset) * duration - at) < 1)).toBe(true);
  }
  expect(flash.frames.filter(({ opacity }) => Number(opacity) > 0).map(({ opacity }) => opacity)).toEqual([
    0.42, 0.5, 0.6
  ]);
  expect(flash.frames.at(-1)!.opacity).toBe(0);
  await activate(false);
  for (const result of animate.mock.results) expect(result.value.revert).toHaveBeenCalledOnce();
  for (const effect of effects) expect(effect.cancel).toHaveBeenCalledOnce();
  showTitle = false;
  await view.rerender();
  await activate(true);
  expect(
    effects
      .at(-1)!
      .frames.filter(({ opacity }) => Number(opacity) > 0)
      .map(({ opacity }) => opacity)
  ).toEqual([0.42, 0.5, 0.6]);
  const titleIndex = calls.map(([target]) => target.dataset.entrance).lastIndexOf('highlight-title');
  const [title, options] = calls[titleIndex];
  expect(options.opacity).toEqual([0, 1]);
  const animation = animate.mock.results[titleIndex].value;
  const complete = (options as unknown as { onComplete(animation: unknown): void }).onComplete;
  complete(animation);
  expect(animation.revert).toHaveBeenCalledOnce();
  expect(title.style.opacity).toBe('0');
  await view.unmount();
  for (const effect of effects) expect(effect.cancel).toHaveBeenCalledOnce();
});

it('replays on result or Program activation despite OS reduced motion while respecting the app switch and operator edits', async () => {
  Object.defineProperty(motion, 'matches', { configurable: true, value: true });
  let playAnimations = true;
  const useAppearance = appearanceSettings.useAppearance;
  vi.spyOn(appearanceSettings, 'useAppearance').mockImplementation(() => {
    const context = useAppearance();
    return { ...context, appearance: { ...context.appearance, entranceAnimations: playAnimations } };
  });
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
  expect(second.revert).not.toHaveBeenCalled();
  await activate(false);
  await activate(true);
  expect(animate).toHaveBeenCalledTimes(3);
  const latest = animate.mock.results.at(-1)!.value;
  playAnimations = false;
  await view.rerender();
  expect(latest.revert).toHaveBeenCalledOnce();
  await activate(false);
  await activate(true);
  expect(animate).toHaveBeenCalledTimes(3);
  playAnimations = true;
  await view.rerender();
  expect(animate).toHaveBeenCalledTimes(4);
  enabled = false; // Operator previews keep their editing surface still.
  await view.rerender();
  await activate(false);
  await activate(true);
  expect(animate).toHaveBeenCalledTimes(4);
  await view.unmount();
});

it('enters after a cold load and again when Preview first becomes Program', async () => {
  Object.defineProperty(motion, 'matches', { configurable: true, value: true });
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
  expect(entrance.revert).not.toHaveBeenCalled();
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

it('replays a manual winner replacement but keeps a linked entrant name correction still', async () => {
  const selectedSet = createTestOverlayState().selectedSet;
  selectedSet.playerOne.entrantId = '';
  selectedSet.playerTwo.entrantId = '';
  selectedSet.playerOne.score = 1;
  const state = resultScreenStateSchema.parse({
    showPlayerPhoto: false,
    showCharacter: false,
    showSponsorLogo: false,
    showTournamentLogo: false,
    updatedAt: selectedSet.updatedAt
  });
  vi.spyOn(resultSource, 'useResultScreenState').mockReturnValue({
    state,
    setState: vi.fn(),
    reconnect: vi.fn(),
    error: undefined
  });
  const view = await mountView(() =>
    h(AnnouncementOverlay, {
      profile: gameProfiles['street-fighter-6'],
      selectedSet,
      reconnecting: false
    })
  );
  const count = animate.mock.calls.length;
  expect(count).toBeGreaterThan(0);
  selectedSet.playerOne.name = 'Next player';
  await view.rerender();
  expect(animate).toHaveBeenCalledTimes(count * 2);
  selectedSet.playerOne.entrantId = 'linked-one';
  selectedSet.playerTwo.entrantId = 'linked-two';
  await view.rerender();
  const linkedCount = animate.mock.calls.length;
  selectedSet.playerOne.name = 'Corrected spelling';
  await view.rerender();
  expect(animate).toHaveBeenCalledTimes(linkedCount);
  await view.unmount();
});

it('delays custom scoreboard entrances while keeping the usual photo animation', async () => {
  photoSettings.enabled = true;
  vi.spyOn(api, 'resolveScoreboardPhotos').mockResolvedValue({ photos: [null, null] });
  const useAppearance = appearanceSettings.useAppearance;
  vi.spyOn(appearanceSettings, 'useAppearance').mockImplementation(() => {
    const context = useAppearance();
    return { ...context, appearance: { ...context.appearance, entranceDelayMs: 1500 } };
  });
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
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(animate).toHaveBeenCalledTimes(beforeCustom);
  await act(async () => vi.advanceTimersByTimeAsync(500));
  const calls = animate.mock.calls.slice(beforeCustom) as unknown as [
    HTMLElement,
    { transform: string[]; opacity: number[]; duration: number }
  ][];
  expect(calls).toHaveLength(6);
  const [target, options] = calls.find(([element]) => element.dataset.entrance === 'custom-scoreboard')!;
  const [frame, frameOptions] = calls.find(([element]) => element.dataset.entrance === 'custom-frame')!;
  expect(frame.querySelector('.custom-scoreboard-frame')).not.toBeNull();
  expect(frameOptions).toEqual(options);
  expect(target.querySelector('[data-custom-scoreboard-region="playerOneName"]')).not.toBeNull();
  expect(target.querySelector('.scoreboard-player-photos')).toBeNull();
  expect(options.transform[0]).toMatch(/translate3d\(0px, [1-9][0-9]*px, 0\)/);
  expect(options.opacity).toEqual([0, 1]);
  expect(options.duration).toBeGreaterThanOrEqual(2000);
  for (const side of ['left', 'right']) {
    const [photo, photoOptions] = calls.find(([element]) => element.dataset.entrance === `scoreboard-photo-${side}`)!;
    expect(photo.closest('.custom-scoreboard-content')).toBeNull();
    expect(photoOptions.transform[0]).toContain('translate3d(0px, -72px, 0)');
    expect(photoOptions.duration).toBe(2700);
  }
  const afterCustom = animate.mock.calls.length;
  selectedSet = { ...selectedSet, playerOne: { ...selectedSet.playerOne, score: 1 } };
  await custom.rerender();
  expect(animate).toHaveBeenCalledTimes(afterCustom);
  await activate(false);
  await activate(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(animate.mock.calls.length).toBeGreaterThan(afterCustom);
  await custom.unmount();
});

it.each(['JABS', 'custom'])(
  'slides only swapped player text on the %s scoreboard and cleans up interrupted motion',
  async (kind) => {
    const originalPath = window.location.pathname;
    window.history.replaceState(null, '', '/overlay/active/main');
    let selectedSet = createTestOverlayState().selectedSet;
    selectedSet.playerOne.pronouns = 'she/her';
    selectedSet.playerTwo.pronouns = 'he/him';
    const scoreboard = createTestCustomScoreboard();
    scoreboard.visibility.pronouns = true;
    let animateEntrance = true;
    let playAnimations = true;
    const useAppearance = appearanceSettings.useAppearance;
    vi.spyOn(appearanceSettings, 'useAppearance').mockImplementation(() => {
      const context = useAppearance();
      return { ...context, appearance: { ...context.appearance, entranceAnimations: playAnimations } };
    });
    vi.spyOn(overlaySource, 'useOverlayState').mockImplementation(() => ({
      state: { selectedSet },
      setState: vi.fn(),
      error: undefined,
      reconnect: vi.fn()
    }));
    const effects: { target: HTMLElement; frames: Keyframe[]; cancel: ReturnType<typeof vi.fn> }[] = [];
    vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: HTMLElement, frames) {
      const cancel = vi.fn();
      effects.push({ target: this, frames: frames as Keyframe[], cancel });
      return { cancel, finished: new Promise(() => {}) } as unknown as Animation;
    });
    const view = await mountView(() =>
      kind === 'JABS'
        ? h(OverlayView)
        : h(CustomScoreboardCanvas, {
            scoreboard,
            frameUrl: 'frame.png',
            selectedSet,
            animateEntrance
          })
    );
    try {
      expect(effects).toHaveLength(0);
      selectedSet = { ...selectedSet, playerOne: { ...selectedSet.playerOne, score: 1 } };
      await view.rerender();
      expect(effects).toHaveLength(0);
      const swap = () => {
        selectedSet = { ...selectedSet, playerOne: selectedSet.playerTwo, playerTwo: selectedSet.playerOne };
      };
      swap();
      await view.rerender();
      const texts = [...view.container.querySelectorAll<HTMLElement>('[data-scoreboard-swap-text]')];
      expect(texts.length).toBeGreaterThanOrEqual(6);
      expect(effects.map(({ target }) => target)).toEqual(texts);
      for (const effect of effects) {
        const offset = effect.target.dataset.scoreboardSwapText === 'left' ? '-20px 0' : '20px 0';
        expect(effect.frames).toEqual([
          { translate: offset, opacity: 0 },
          { translate: '0px 0', opacity: 1 }
        ]);
        expect(
          effect.target.matches('.scoreboard-player-photos, .custom-scoreboard-frame-layer, .overlay-player')
        ).toBe(false);
      }
      const first = [...effects];
      swap();
      await view.rerender();
      expect(effects).toHaveLength(first.length * 2);
      for (const effect of first) expect(effect.cancel).toHaveBeenCalledOnce();
      await activate(false);
      for (const effect of effects) expect(effect.cancel).toHaveBeenCalledOnce();
      swap();
      await view.rerender();
      await activate(true);
      expect(effects).toHaveLength(first.length * 2);
      swap();
      selectedSet = { ...selectedSet, setId: 'different-match' };
      await view.rerender();
      expect(effects).toHaveLength(first.length * 2);
      playAnimations = false;
      await view.rerender();
      swap();
      await view.rerender();
      expect(effects).toHaveLength(first.length * 2);
      playAnimations = true;
      animateEntrance = kind === 'JABS';
      await view.rerender();
      swap();
      await view.rerender();
      expect(effects).toHaveLength(first.length * (kind === 'JABS' ? 3 : 2));
      await view.unmount();
      for (const effect of effects) expect(effect.cancel).toHaveBeenCalledOnce();
    } finally {
      window.history.replaceState(null, '', originalPath);
    }
  }
);
