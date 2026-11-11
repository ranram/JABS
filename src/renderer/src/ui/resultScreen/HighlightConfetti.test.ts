// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mountView } from '../../hooks/hookTestHarness';
import { trackObsSourceActivity } from '../../hooks/obsSourceActivity';
import { HighlightConfetti } from './HighlightConfetti';
import { highlightConfettiAt } from './highlightEntrance';
import * as appearanceSettings from '../appearance/AppearanceProvider';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('plays confetti once per result or OBS activation and stops when hidden', async () => {
  vi.useFakeTimers();
  const stopTracking = trackObsSourceActivity();
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const useAppearance = appearanceSettings.useAppearance;
  vi.spyOn(appearanceSettings, 'useAppearance').mockImplementation(() => {
    const context = useAppearance();
    return { ...context, appearance: { ...context.appearance, entranceDelayMs: 1000 } };
  });
  let ready = false;
  let presentationKey = 'first';
  const view = await mountView(() => h(HighlightConfetti, { ready, presentationKey }));
  const advance = () => act(async () => vi.advanceTimersByTimeAsync(5000));
  const activity = (active: boolean) =>
    act(async () => {
      window.dispatchEvent(new CustomEvent('obsSourceActiveChanged', { detail: { active } }));
    });
  try {
    await advance();
    expect(play).not.toHaveBeenCalled();
    ready = true;
    await view.rerender();
    await act(async () => vi.advanceTimersByTimeAsync(highlightConfettiAt));
    expect(play).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(play).toHaveBeenCalledTimes(1);
    await view.rerender();
    await advance();
    expect(play).toHaveBeenCalledTimes(1);
    await activity(false);
    expect(pause).toHaveBeenCalled();
    await advance();
    expect(play).toHaveBeenCalledTimes(1);
    await activity(true);
    await advance();
    expect(play).toHaveBeenCalledTimes(2);
    presentationKey = 'second';
    await view.rerender();
    await advance();
    expect(play).toHaveBeenCalledTimes(3);
    await act(async () => view.container.querySelector('video')!.dispatchEvent(new Event('ended')));
    expect(view.container.querySelector('video')!.style.visibility).toBe('hidden');
    await view.unmount();
    const pauses = pause.mock.calls.length;
    await advance();
    expect(pause).toHaveBeenCalledTimes(pauses);
    expect(play).toHaveBeenCalledTimes(3);
  } finally {
    await view.unmount();
    stopTracking();
  }
});
