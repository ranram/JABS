// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { StingerCue, StingerState } from '@shared/stingers';
import { createTestOverlayState } from '@shared/testFixtures';
import { deferred, mountView } from '../../hooks/hookTestHarness';
import { getObsSourceActivity, trackObsSourceActivity } from '../../hooks/obsSourceActivity';
import { initializeI18n } from '../../i18n';
import { StingersOverlay } from './StingersOverlay';
import { StingerFramingPreview, StingerStage } from './StingerStage';
import { StingerQuickMenu } from './StingerQuickMenu';
import * as appearanceSettings from '../appearance/AppearanceProvider';

const transport = vi.hoisted(() => ({
  snapshot: undefined as StingerState | undefined,
  error: undefined as string | undefined,
  source: vi.fn(),
  claim: vi.fn(),
  finish: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  reconnect: vi.fn(),
  identity: vi.fn(),
  characters: vi.fn(),
  photo: vi.fn(),
  artwork: vi.fn(),
  save: vi.fn(),
  importVideo: vi.fn(),
  mediaPlay: vi.fn(),
  mediaPause: vi.fn(),
  videoUrl: vi.fn()
}));
vi.mock('../../hooks/useStingers', () => ({
  useStingers: () => ({
    state: transport.snapshot,
    error: transport.error,
    reconnectSources: transport.reconnect,
    setState: (state: StingerState) => {
      transport.snapshot = state;
    }
  })
}));
vi.mock('../../api', () => ({
  api: {
    stingers: async () => transport.snapshot,
    updateStingers: transport.save,
    importStinger: transport.importVideo,
    stingerSource: transport.source,
    claimStinger: transport.claim,
    finishStinger: transport.finish,
    playStinger: transport.play,
    stopStinger: transport.stop,
    stingerVideoUrl: transport.videoUrl,
    identityMedia: transport.identity,
    gameCharacterAssets: transport.characters,
    playerPhotoAssetUrl: transport.photo,
    gameCharacterAssetUrl: transport.artwork
  }
}));

const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
let stopTracking: (() => void) | undefined;
beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  vi.useFakeTimers();
  transport.snapshot = {
    readySources: 0,
    settings: {
      perfect: { video: { id: 'perfect.webm', name: 'Perfect.webm' } },
      winner: { video: { id: 'winner.webm', name: 'Winner.webm' } },
      automaticWinner: false,
      mediaDelaySeconds: 0,
      videoLayer: 'foreground',
      updatedAt: '1'
    }
  };
  transport.error = undefined;
  vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  transport.videoUrl.mockImplementation(async (id: string) => `http://127.0.0.1:4279/assets/stingers/${id}`);
  Reflect.set(window, 'obsstudio', {});
  transport.source.mockResolvedValue(transport.snapshot);
  transport.reconnect.mockImplementation(async () => {
    transport.snapshot = { ...transport.snapshot!, connectionId: 'reconnected', readySources: 0, cue: undefined };
    return transport.snapshot;
  });
  transport.claim.mockImplementation(async () => ({ cue: { ...transport.snapshot?.cue, claimed: true } }));
  transport.finish.mockResolvedValue(transport.snapshot);
  transport.save.mockImplementation(async (settings) => {
    transport.snapshot = { ...transport.snapshot!, settings };
    return transport.snapshot;
  });
  transport.identity.mockResolvedValue({ matches: [{ playerPhotoAssetId: 'player.png' }] });
  transport.characters.mockResolvedValue({ assets: [] });
  transport.photo.mockResolvedValue('data:image/png;base64,photo');
  transport.artwork.mockResolvedValue('data:image/png;base64,character');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    transport.mediaPlay();
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => transport.mediaPause());
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
});
afterEach(() => {
  stopTracking?.();
  stopTracking = undefined;
  Reflect.deleteProperty(window, 'obsstudio');
  vi.restoreAllMocks();
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
  vi.clearAllMocks();
  vi.useRealTimers();
});
function cue(kind: 'perfect' | 'winner' = 'perfect'): StingerCue {
  return {
    id: 'cue-one',
    kind,
    settings: transport.snapshot!.settings,
    claimed: false,
    expiresAt: Date.now() + 125_000
  };
}
async function activate(active: boolean) {
  await act(async () => window.dispatchEvent(new CustomEvent('obsSourceActiveChanged', { detail: { active } })));
}

it('claims only on Program activation, plays once, and clears video and audio on stop or disconnect', async () => {
  const oldPlay = deferred<void>();
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
    transport.mediaPlay();
    this.dispatchEvent(new Event('playing'));
    return oldPlay.promise;
  });
  stopTracking = trackObsSourceActivity();
  await activate(false);
  const view = await mountView(() => h(StingersOverlay));
  await act(async () =>
    window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: true } }))
  );
  expect(transport.source.mock.calls.some(([, active]) => active)).toBe(false);
  transport.snapshot = { ...transport.snapshot!, connectionId: 'reset-while-inactive' };
  await view.rerender();
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), false, false);
  await activate(true);
  expect(transport.source.mock.calls.some(([, active]) => active)).toBe(true);
  // OBS Program activity is authoritative even when its embedded browser marks
  // the document hidden (for example after minimizing the OBS window).
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), true, true);
  transport.snapshot = { ...transport.snapshot!, cue: cue(), readySources: 1 };
  await view.rerender();
  expect(transport.claim).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector('video')).not.toBeNull();
  expect(transport.mediaPlay).toHaveBeenCalledTimes(1);
  transport.snapshot = { ...transport.snapshot, cue: { ...transport.snapshot.cue!, claimed: true } };
  await view.rerender();
  expect(transport.mediaPlay).toHaveBeenCalledTimes(1);
  await act(async () => view.container.querySelector('video')!.dispatchEvent(new Event('ended')));
  expect(transport.finish).toHaveBeenCalledWith(expect.any(String), 'cue-one', undefined);
  expect(view.container.querySelector('video')).toBeNull();
  expect(transport.mediaPause).toHaveBeenCalled();
  await view.unmount();
  const refreshed = await mountView(() => h(StingersOverlay));
  expect(refreshed.container.querySelector('video')).toBeNull();
  expect(transport.claim).toHaveBeenCalledTimes(1);
  transport.snapshot = { ...transport.snapshot!, cue: { ...cue(), id: 'cue-two' } };
  await refreshed.rerender();
  expect(refreshed.container.querySelector('video')).not.toBeNull();
  await act(async () => oldPlay.reject(new Error('Old playback was cancelled')));
  expect(refreshed.container.querySelector('video')).not.toBeNull();
  expect(transport.finish).toHaveBeenCalledTimes(1);
  transport.error = 'disconnected';
  await refreshed.rerender();
  expect(refreshed.container.querySelector('video')).toBeNull();
});

it('hides on the chosen duration and reports decoding errors without leaving media behind', async () => {
  const finished = vi.fn();
  const timed = cue();
  timed.settings = { ...timed.settings, perfect: { ...timed.settings.perfect, durationSeconds: 2 } };
  const view = await mountView(() => h(StingerStage, { cue: timed, onFinish: finished }));
  expect(view.container.querySelector('video')!.volume).toBe(1);
  expect(view.container.querySelector('video')!.muted).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999);
  });
  expect(finished).not.toHaveBeenCalled();
  await act(async () => {
    view.container.querySelector('video')!.currentTime = 2;
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(finished).toHaveBeenCalledWith();
  await act(async () => view.container.querySelector('video')!.dispatchEvent(new Event('error')));
  expect(finished).toHaveBeenCalledWith('playback-failed');
  await view.unmount();
  transport.videoUrl.mockRejectedValueOnce(new Error('Video URL is unavailable'));
  const unavailable = vi.fn();
  await mountView(() => h(StingerStage, { cue: cue(), onFinish: unavailable }));
  expect(unavailable).toHaveBeenCalledWith('playback-failed');
});

it('registers an OBS source despite browser occlusion and reconnects without replaying an old cue', async () => {
  transport.source.mockRejectedValueOnce(new Error('Heartbeat timed out'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  stopTracking = trackObsSourceActivity();
  const view = await mountView(() => h(StingersOverlay));
  expect(transport.source).toHaveBeenCalledWith(expect.any(String), true, false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(transport.source).toHaveBeenCalledTimes(2);
  await act(async () =>
    window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: false } }))
  );
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), false, false);
  await act(async () =>
    window.dispatchEvent(new CustomEvent('obsSourceVisibleChanged', { detail: { visible: true } }))
  );
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), true, false);
  transport.snapshot = { ...transport.snapshot!, connectionId: 'initial-connection' };
  await view.rerender();
  expect(window.location.reload).not.toHaveBeenCalled();
  transport.error = 'JABS is restarting';
  await view.rerender();
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), false, false);
  transport.error = undefined;
  transport.snapshot = { ...transport.snapshot!, cue: { ...cue(), claimed: true } };
  await view.rerender();
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), true, false);
  expect(transport.claim).not.toHaveBeenCalled();
  expect(view.container.querySelector('video')).toBeNull();
  await activate(false);
  transport.snapshot = { ...transport.snapshot!, connectionId: 'new-connection', cue: undefined };
  await view.rerender();
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), false, false);
  expect(window.location.reload).not.toHaveBeenCalled();
  expect(transport.claim).not.toHaveBeenCalled();
  await view.unmount();
  Reflect.deleteProperty(window, 'obsstudio');
  transport.source.mockClear();
  await mountView(() => h(StingersOverlay));
  expect(transport.source.mock.calls.some(([, active]) => active)).toBe(false);
});

it('honors direct OBS activity callbacks without duplicate activation or playback', async () => {
  const previousActive = vi.fn();
  const previousVisible = vi.fn();
  const obs = { onActiveChange: previousActive, onVisibilityChange: previousVisible };
  Reflect.set(window, 'obsstudio', obs);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  stopTracking = trackObsSourceActivity();
  obs.onActiveChange(false);
  obs.onVisibilityChange(true);
  const view = await mountView(() => h(StingersOverlay));
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), false, false);
  await act(async () => {
    obs.onActiveChange(true);
    obs.onVisibilityChange(false);
  });
  await activate(true);
  expect(getObsSourceActivity().activation).toBe(1);
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), true, true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), true, true);
  transport.snapshot = { ...transport.snapshot!, cue: cue() };
  await view.rerender();
  expect(transport.claim).toHaveBeenCalledOnce();
  await act(async () => obs.onActiveChange(false));
  expect(transport.source).toHaveBeenLastCalledWith(expect.any(String), false, false);
  expect(view.container.querySelector('video')).toBeNull();
  expect(previousActive).toHaveBeenCalledWith(false);
  expect(previousVisible).toHaveBeenCalledWith(false);
  await view.unmount();
  stopTracking();
  stopTracking = undefined;
  expect(obs.onActiveChange).toBe(previousActive);
  expect(obs.onVisibilityChange).toBe(previousVisible);
});

it('renews registration in place after reconnect without replaying a claimed cue', async () => {
  stopTracking = trackObsSourceActivity();
  await activate(true);
  transport.snapshot = { ...transport.snapshot!, connectionId: 'first-session' };
  const view = await mountView(() => h(StingersOverlay));
  const oldClient = transport.source.mock.calls.at(-1)![0];
  transport.snapshot = {
    ...transport.snapshot!,
    connectionId: 'reconnected-session',
    cue: { ...cue(), claimed: true }
  };
  await view.rerender();
  const [newClient, active, program] = transport.source.mock.calls.at(-1)!;
  expect(newClient).not.toBe(oldClient);
  expect([active, program]).toEqual([true, true]);
  expect(transport.source).toHaveBeenCalledWith(oldClient, false, false);
  expect(window.location.reload).not.toHaveBeenCalled();
  expect(transport.claim).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(transport.source).toHaveBeenLastCalledWith(newClient, true, true);
  transport.snapshot = { ...transport.snapshot!, cue: { ...cue(), id: 'new-result' } };
  await view.rerender();
  expect(transport.claim).toHaveBeenCalledExactlyOnceWith(newClient, 'new-result');
  await view.unmount();
  expect(transport.source).toHaveBeenLastCalledWith(newClient, false, false);
});

it('waits for the captured winner media and reveals it at the configured time', async () => {
  const identity = deferred<{ matches: { playerPhotoAssetId: string }[] }>();
  transport.identity.mockReturnValue(identity.promise);
  const selected = createTestOverlayState().selectedSet;
  selected.playerOne.score = 2;
  selected.playerTwo.score = 0;
  selected.bestOf = 3;
  selected.playerOne.name = 'Captured winner';
  selected.playerOne.prefix = ' FSG ';
  selected.playerOne.sponsor = 'Other sponsor';
  selected.playerOne.character = 'Ryu';
  selected.playerOne.characters = ['Ryu'];
  transport.characters.mockResolvedValue({ assets: [{ character: 'Ryu', assetId: 'ryu.png', variants: [] }] });
  const winnerCue = {
    ...cue('winner'),
    selectedSet: { ...selected, matchFormat: 'best-of' as const },
    settings: { ...transport.snapshot!.settings, mediaDelaySeconds: 1 }
  };
  const view = await mountView(() => h(StingerStage, { cue: winnerCue, onFinish: vi.fn() }));
  expect(transport.mediaPlay).not.toHaveBeenCalled();
  await act(async () => identity.resolve({ matches: [{ playerPhotoAssetId: 'player.png' }] }));
  expect(transport.mediaPlay).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector<HTMLElement>('.stinger-winner')!.style.visibility).toBe('hidden');
  await act(async () => {
    const video = view.container.querySelector('video')!;
    video.currentTime = 1;
    video.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(view.container.querySelector<HTMLElement>('.stinger-winner')!.style.visibility).toBe('visible');
  expect(view.container.querySelector('.stinger-name')!.textContent).toContain('Captured winner');
  expect(view.container.querySelector('.stinger-name-prefix')!.textContent).toBe('FSG');
  expect(view.container.querySelector('.stinger-name-tag')!.textContent).toBe('Captured winner');
  expect(view.container.querySelector('.stinger-name')!.textContent).not.toContain('|');
  expect(view.container.querySelector('.stinger-stage')!.classList.contains('theme-sf6')).toBe(true);
  expect(view.container.querySelector('.stinger-photo')!.getAttribute('src')).toBe('data:image/png;base64,photo');
  expect(view.container.querySelector('.stinger-character')!.getAttribute('src')).toBe(
    'data:image/png;base64,character'
  );
});

it('stages the winner assets on the video clock, fits the actual clip, and cancels movement on stop', async () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  Object.defineProperty(reducedMotion, 'matches', { configurable: true, value: true });
  vi.spyOn(window, 'matchMedia').mockReturnValue(reducedMotion);
  let playAnimations = true;
  const useAppearance = appearanceSettings.useAppearance;
  vi.spyOn(appearanceSettings, 'useAppearance').mockImplementation(() => {
    const context = useAppearance();
    return { ...context, appearance: { ...context.appearance, entranceAnimations: playAnimations } };
  });
  const animations: {
    element: Element;
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
    currentTime: number;
    playbackRate: number;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value(this: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
      const animation = {
        element: this,
        frames,
        options,
        currentTime: 0,
        playbackRate: 1,
        finished: Promise.resolve(),
        play: vi.fn(),
        pause: vi.fn(),
        cancel: vi.fn()
      };
      animations.push(animation);
      return animation;
    }
  });
  const selected = createTestOverlayState().selectedSet;
  selected.bestOf = 3;
  selected.playerOne.score = 2;
  selected.playerTwo.score = 0;
  selected.playerOne.character = 'Ryu';
  transport.characters.mockResolvedValue({ assets: [{ character: 'Ryu', assetId: 'ryu.png', variants: [] }] });
  const winnerCue: StingerCue = {
    ...cue('winner'),
    selectedSet: { ...selected, matchFormat: 'best-of' },
    settings: {
      ...transport.snapshot!.settings,
      mediaDelaySeconds: 1,
      winner: { ...transport.snapshot!.settings.winner, durationSeconds: 10 }
    }
  };
  const finished = vi.fn();
  const view = await mountView(() => h(StingerStage, { cue: winnerCue, onFinish: finished }));
  const video = view.container.querySelector('video')!;
  const layer = view.container.querySelector<HTMLElement>('.stinger-winner')!;
  const move = async (time: number, event = 'timeupdate') =>
    act(async () => {
      video.currentTime = time;
      video.dispatchEvent(new Event(event));
    });
  expect(layer.style.visibility).toBe('hidden');
  await act(async () => vi.advanceTimersByTimeAsync(1100));
  expect(layer.style.visibility).toBe('hidden');
  Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
  await act(async () => video.dispatchEvent(new Event('durationchange')));
  const active = animations.slice(-3);
  expect(animations.slice(0, -3).every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  expect(active.map(({ options }) => options.duration)).toEqual([7000, 7000, 7000]);
  await move(1);
  expect(layer.style.visibility).toBe('visible');
  await move(3);
  expect(active.every((animation) => animation.currentTime === 2000)).toBe(true);
  await act(async () => video.dispatchEvent(new Event('waiting')));
  const starts = active.map((animation) => animation.play.mock.calls.length);
  await act(async () => vi.advanceTimersByTimeAsync(15_000));
  expect(finished).not.toHaveBeenCalled();
  expect(active.map((animation) => animation.play.mock.calls.length)).toEqual(starts);
  await act(async () => video.dispatchEvent(new Event('playing')));
  expect(active.every((animation) => animation.currentTime === 2000)).toBe(true);
  await move(0.5, 'seeking');
  expect(layer.style.visibility).toBe('hidden');
  await act(async () => video.dispatchEvent(new Event('seeked')));
  await move(7.8);
  expect(active.every((animation) => animation.currentTime === 6800)).toBe(true);
  await move(8);
  expect(layer.style.visibility).toBe('hidden');

  // A user duration shorter than the video also sets the fade boundary.
  Object.defineProperty(video, 'duration', { configurable: true, value: 20 });
  await act(async () => video.dispatchEvent(new Event('durationchange')));
  expect(animations.slice(-3).map(({ options }) => options.duration)).toEqual([9000, 9000, 9000]);
  await move(10);
  expect(finished).toHaveBeenCalledWith();

  // Late reveals in short clips must keep their keyframes ordered and bounded.
  await move(0, 'seeking');
  await act(async () => video.dispatchEvent(new Event('seeked')));
  Object.defineProperty(video, 'duration', { configurable: true, value: 1.2 });
  await act(async () => video.dispatchEvent(new Event('durationchange')));
  const short = animations.slice(-3);
  expect(short.every(({ options }) => options.duration === 200)).toBe(true);
  for (const { frames } of short) {
    const offsets = frames.map((frame) => Number(frame.offset));
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(offsets.every((offset) => offset >= 0 && offset <= 1)).toBe(true);
  }
  const animatedCount = animations.length;
  Object.defineProperty(reducedMotion, 'matches', { configurable: true, value: true });
  await act(async () => reducedMotion.dispatchEvent(new Event('change')));
  await move(1.1);
  expect(layer.style.visibility).toBe('visible');
  expect(short.every((animation) => animation.cancel.mock.calls.length === 0)).toBe(true);
  expect(animations).toHaveLength(animatedCount);
  playAnimations = false;
  await view.rerender();
  expect(short.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  expect(animations).toHaveLength(animatedCount);

  // Missing animation support still obeys the reveal window.
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined });
  playAnimations = true;
  await view.rerender();
  expect(layer.style.visibility).toBe('visible');
  Object.defineProperty(video, 'duration', { configurable: true, value: 0.5 });
  await act(async () => video.dispatchEvent(new Event('durationchange')));
  expect(layer.style.visibility).toBe('hidden');
  expect(animations).toHaveLength(animatedCount);
  await view.unmount();
  expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  const count = animations.length;
  const framing = await mountView(() =>
    h(StingerFramingPreview, { selectedSet: winnerCue.selectedSet, labels: ['Photo', 'Art', 'Name'] })
  );
  expect(framing.container.querySelector('.stinger-photo')).not.toBeNull();
  expect(animations).toHaveLength(count);
});

it('plays configured clips from the toolbar, prevents duplicate requests, and stops the broadcast cue', async () => {
  const activeSet = createTestOverlayState().selectedSet;
  activeSet.bestOf = 3;
  activeSet.playerOne.score = 2;
  activeSet.playerTwo.score = 0;
  transport.snapshot!.readySources = 1;
  const play = deferred<StingerState>();
  transport.play.mockReturnValueOnce(play.promise);
  transport.stop.mockImplementation(async () => ({ ...transport.snapshot!, cue: undefined }));
  const configure = vi.fn();
  const failure = vi.spyOn(notifications, 'show').mockImplementation(() => 'notice');
  const view = await mountView(() =>
    h(MantineProvider, { env: 'test' }, h(StingerQuickMenu, { activeSet, onConfigure: configure }))
  );
  const open = async () => {
    await act(async () => view.container.querySelector('button')!.click());
  };
  const item = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find((node) =>
      node.textContent?.includes(label)
    )!;
  await open();
  expect(item('Play Winner').disabled).toBe(false);
  await act(async () => item('Play Perfect').click());
  expect(transport.play).toHaveBeenCalledWith('perfect');
  await open();
  expect(item('Play Perfect').disabled).toBe(true);
  expect(item('Play Winner').disabled).toBe(true);
  await act(async () => item('Play Winner').click());
  expect(transport.play).toHaveBeenCalledTimes(1);
  await act(async () => play.resolve({ ...transport.snapshot!, cue: cue() }));
  expect(document.body.textContent).toContain('Starting: Perfect');
  transport.snapshot = { ...transport.snapshot!, cue: { ...cue(), claimed: true } };
  await view.rerender();
  expect(document.body.textContent).toContain('Playing: Perfect');
  await act(async () => item('Stop in OBS').click());
  expect(transport.stop).toHaveBeenCalledOnce();
  expect(transport.snapshot!.cue).toBeUndefined();
  transport.play.mockRejectedValueOnce(new Error('Source left Program'));
  await open();
  await act(async () => item('Play Perfect').click());
  expect(failure).toHaveBeenCalledWith(expect.objectContaining({ message: 'Source left Program', color: 'red' }));
  await open();
  await act(async () => item('Configure stingers').click());
  expect(configure).toHaveBeenCalledOnce();
  expect(transport.claim).not.toHaveBeenCalled();
  expect(view.container.querySelector('video')).toBeNull();
});

it('explains unavailable toolbar clips and keeps Stop accessible during a disconnect', async () => {
  const activeSet = createTestOverlayState().selectedSet;
  activeSet.bestOf = 3;
  activeSet.state = undefined;
  activeSet.playerOne.score = 0;
  activeSet.playerTwo.score = 0;
  const view = await mountView(() =>
    h(MantineProvider, { env: 'test' }, h(StingerQuickMenu, { activeSet, onConfigure() {} }))
  );
  await act(async () => view.container.querySelector('button')!.click());
  const items = () => [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
  expect(
    items()
      .filter((node) => node.textContent?.includes('Play '))
      .every((node) => node.disabled)
  ).toBe(true);
  expect(document.body.textContent).toContain('Place the Stingers browser source in your active OBS scene.');
  transport.snapshot!.readySources = 1;
  await view.rerender();
  expect(items().find((node) => node.textContent?.includes('Play Perfect'))!.disabled).toBe(false);
  expect(items().find((node) => node.textContent?.includes('Play Winner'))!.disabled).toBe(true);
  expect(document.body.textContent).toContain('Complete the set score to play Winner.');
  transport.error = 'Disconnected';
  await view.rerender();
  expect(
    items()
      .filter((node) => node.textContent?.includes('Play '))
      .every((node) => node.disabled)
  ).toBe(true);
  expect(items().find((node) => node.textContent === 'Stop in OBS')!.disabled).toBe(false);
  const reconnect = items().find((node) => node.textContent === 'Reconnect OBS source')!;
  expect(reconnect.disabled).toBe(false);
  await act(async () => reconnect.click());
  expect(transport.reconnect).toHaveBeenCalledOnce();
  await act(async () => view.container.querySelector('button')!.click());
  transport.error = undefined;
  transport.snapshot!.settings.perfect.video = undefined;
  transport.snapshot!.settings.winner.video = undefined;
  await view.rerender();
  expect(items().filter((node) => node.textContent?.includes('Play '))).toHaveLength(0);
  expect(document.body.textContent).toContain('No videos configured yet.');
  transport.snapshot = undefined;
  await view.rerender();
  expect(document.body.textContent).toContain('Loading stingers…');
  expect(transport.play).not.toHaveBeenCalled();
});
