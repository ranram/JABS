import { useLayoutEffect, useRef, type RefObject } from 'react';
import { winnerStingerFraming } from '@shared/stingers';
import type { StingerPlaybackClock } from './useStingerPlaybackClock';
import { useAppearance } from '../appearance/AppearanceProvider';
import { winnerSubjectKeyframes } from './winnerSubjectKeyframes';

/** Keep the winner reveal on the video's clock, including stalls and seeks. */
export function useStingerWinnerAnimation(
  clockRef: RefObject<StingerPlaybackClock | null>,
  ready: boolean,
  mediaDelaySeconds: number,
  durationSeconds?: number
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { appearance } = useAppearance();

  useLayoutEffect(() => {
    const stage = rootRef.current;
    const availableClock = clockRef.current;
    if (!stage || !availableClock || !ready) return;
    const clock = availableClock;
    const root = stage;
    const start = mediaDelaySeconds * 1000;
    let end = 0;
    let animations: Animation[] = [];
    let boundary: ReturnType<typeof setTimeout> | undefined;

    function clearAnimations() {
      for (const animation of animations) {
        // Seeking back from the end can replace the native completion promise.
        void animation.finished.catch(() => undefined);
        animation.cancel();
      }
      animations = [];
    }

    function sync() {
      clearTimeout(boundary);
      const time = clock.time() * 1000;
      const visible = clock.started() && time >= start && time < end && !clock.finished();
      root.style.visibility = visible ? 'visible' : 'hidden';
      for (const animation of animations) {
        animation.currentTime = Math.max(0, Math.min(end - start, time - start));
        animation.playbackRate = clock.rate();
        if (clock.running() && visible) animation.play();
        else animation.pause();
      }
      if (clock.running() && time < end && clock.rate() > 0) {
        const next = time < start ? Math.min(start, end) : end;
        boundary = setTimeout(sync, Math.max(16, (next - time) / clock.rate()));
      }
    }

    function rebuild() {
      clearAnimations();
      end = clock.duration() * 1000;
      const duration = end - start;
      if (duration > 0 && appearance.entranceAnimations) {
        try {
          const exitStart = duration - Math.min(2000, duration * 0.45);
          const tempo = Math.min(1, exitStart / 3000);
          const framing = winnerStingerFraming(
            Boolean(root.querySelector('.stinger-photo')),
            Boolean(root.querySelector('.stinger-character'))
          );
          const photoSlide = -((framing.photo.x + framing.photo.width + 64) / framing.photo.width) * 100;
          const characterSlide = ((1920 - framing.character.x + 64) / framing.character.width) * 100;
          const nameSlide = -((framing.name.y + framing.name.height + 64) / framing.name.height) * 100;
          const subjects = [
            {
              selector: '.stinger-photo',
              delay: 450,
              entrance: 1800,
              from: `translate3d(${photoSlide}%, 0, 0)`,
              rest: 'translate3d(0, 0, 0)'
            },
            {
              selector: '.stinger-character',
              delay: 0,
              entrance: 2200,
              from: `translate3d(${characterSlide}%, 0, 0)`,
              rest: 'translate3d(0, 0, 0)'
            },
            {
              selector: '.stinger-name',
              delay: 800,
              entrance: 1400,
              from: `translate3d(0, ${nameSlide}%, 0)`,
              rest: 'translate3d(0, 0, 0)'
            }
          ];
          for (const subject of subjects) {
            const element = root.querySelector<HTMLElement>(subject.selector);
            if (!element) continue;
            const delay = subject.delay * tempo;
            const settled = delay + subject.entrance * tempo;
            const image = subject.selector !== '.stinger-name';
            const baseFilter = getComputedStyle(element).filter || 'none';
            const frames = winnerSubjectKeyframes({
              from: subject.from,
              rest: subject.rest,
              filter: image ? baseFilter : undefined,
              delay,
              settled,
              duration,
              exitStart,
              tempo
            });
            const animation = element.animate(frames, { duration, fill: 'both' });
            void animation.finished.catch(() => undefined);
            animation.pause();
            animations.push(animation);
          }
        } catch {
          // Older browser sources can still show the winner at the chosen delay.
          clearAnimations();
        }
      }
      sync();
    }
    const unsubscribe = clock.subscribe((durationChanged) => (durationChanged ? rebuild() : sync()));
    rebuild();
    return () => {
      clearTimeout(boundary);
      unsubscribe();
      clearAnimations();
      root.style.visibility = 'hidden';
    };
  }, [clockRef, ready, mediaDelaySeconds, durationSeconds, appearance.entranceAnimations]);

  return rootRef;
}
