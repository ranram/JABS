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
  const played = useRef<{ activation: number; presentationKey?: string } | undefined>(undefined);
  const { active, activation } = useSyncExternalStore(subscribeObsSourceActivity, getObsSourceActivity);
  const inactive = active === false;

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
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) {
      played.current = { activation, presentationKey };
      return;
    }
    let cancelled = false;
    let revert: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout>;
    root.dataset.entrancePending = '';

    function cancel() {
      cancelled = true;
      clearTimeout(timer);
      revert?.();
      delete root.dataset.entrancePending;
    }
    function onReducedMotion() {
      if (reducedMotion.matches) {
        played.current = { activation, presentationKey };
        cancel();
      }
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
        revert = playOverlayEntrance(root, cues);
      } catch {
        // Keep the static layout readable if the browser cannot animate it.
      } finally {
        delete root.dataset.entrancePending;
      }
    }

    reducedMotion.addEventListener('change', onReducedMotion);
    // OBS does not expose a current-source status getter. A fresh page gets one
    // entrance; subsequent entrances follow its Program activation events.
    if (ready) void begin();
    else
      timer = setTimeout(() => {
        void begin();
      }, 1000);
    return () => {
      cancel();
      reducedMotion.removeEventListener('change', onReducedMotion);
    };
  }, [activation, inactive, cues, animationsEnabled, ready, presentationKey]);

  return rootRef;
}
