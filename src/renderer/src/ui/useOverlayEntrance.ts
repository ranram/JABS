import { useAppearance } from './appearance/AppearanceProvider';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { getObsSourceActivity, subscribeObsSourceActivity } from '../hooks/obsSourceActivity';
import { playOverlayEntrance, type EntranceCue } from './overlayEntrance';
import './overlayEntrance.css';

export function useOverlayEntrance<T extends HTMLElement | SVGSVGElement = HTMLElement>(
  cues: readonly EntranceCue[],
  enabled: boolean,
  ready = true,
  presentationKey?: string
) {
  const { appearance } = useAppearance();
  const animationsEnabled = enabled && appearance.entranceAnimations;
  const rootRef = useRef<T>(null);
  const runningAnimation = useRef<(() => void) | undefined>(undefined);
  const played = useRef<{ activation: number; presentationKey?: string } | undefined>(undefined);
  const { active, activation } = useSyncExternalStore(subscribeObsSourceActivity, getObsSourceActivity);
  const inactive = active === false;

  function stopAnimation() {
    runningAnimation.current?.();
    runningAnimation.current = undefined;
  }

  // Broadcast motion follows the operator's switch, independently of local OS preferences.
  // Loading updates must not interrupt an entrance that is already playing.
  useLayoutEffect(() => {
    if (!animationsEnabled || inactive) return;
    return stopAnimation;
  }, [activation, inactive, cues, animationsEnabled, presentationKey]);

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!animationsEnabled || inactive) {
      played.current = undefined;
      return;
    }
    if (
      !element ||
      (played.current?.activation === activation && played.current.presentationKey === presentationKey) ||
      typeof Element.prototype.animate !== 'function'
    )
      return;
    const root = element;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    root.dataset.entrancePending = '';

    function cancel() {
      cancelled = true;
      clearTimeout(timer);
      delete root.dataset.entrancePending;
    }
    async function begin() {
      const images = [...root.querySelectorAll('img')];
      const assets = Promise.all([
        document.fonts?.ready,
        ...images.map((image) => image.decode?.().catch(() => undefined))
      ]);
      // A missing image or stalled font must never leave the scoreboard hidden.
      await Promise.race([
        assets,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 500);
        })
      ]);
      clearTimeout(timer);
      if (cancelled) return;
      played.current = { activation, presentationKey };
      try {
        runningAnimation.current = playOverlayEntrance(root, cues);
      } catch {
        // Keep the static layout readable if the browser cannot animate it.
      } finally {
        delete root.dataset.entrancePending;
      }
    }

    // OBS does not expose a current-source status getter. A fresh page gets one
    // entrance; subsequent entrances follow its Program activation events.
    if (ready) void begin();
    else
      timer = setTimeout(() => {
        void begin();
      }, 1000);
    return () => {
      cancel();
    };
  }, [activation, inactive, cues, animationsEnabled, ready, presentationKey]);

  return rootRef;
}
