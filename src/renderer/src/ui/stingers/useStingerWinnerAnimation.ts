import { useLayoutEffect, useRef, type RefObject } from 'react';
import { stingerFraming, stingerLimits } from '@shared/stingers';
import { useAppearance } from '../appearance/AppearanceProvider';

/** Keep the winner reveal on the video's clock, including stalls and seeks. */
export function useStingerWinnerAnimation(
  videoRef: RefObject<HTMLVideoElement | null>,
  ready: boolean,
  mediaDelaySeconds: number,
  durationSeconds?: number
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { appearance } = useAppearance();

  useLayoutEffect(() => {
    const stage = rootRef.current;
    const element = videoRef.current;
    if (!stage || !element || !ready) return;
    const root = stage;
    const video = element;
    const start = mediaDelaySeconds * 1000;
    let end = 0;
    let running = !video.paused && !video.seeking;
    let started = running;
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
      const time = video.currentTime * 1000;
      const visible = started && time >= start && time < end && !video.ended;
      root.style.visibility = visible ? 'visible' : 'hidden';
      for (const animation of animations) {
        animation.currentTime = Math.max(0, Math.min(end - start, time - start));
        animation.playbackRate = video.playbackRate;
        if (running && visible) animation.play();
        else animation.pause();
      }
      if (running && time < end && video.playbackRate > 0) {
        const next = time < start ? Math.min(start, end) : end;
        boundary = setTimeout(sync, Math.max(16, (next - time) / video.playbackRate));
      }
    }

    function rebuild() {
      clearAnimations();
      const naturalDuration =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : stingerLimits.durationSeconds;
      end = Math.min(naturalDuration, durationSeconds ?? stingerLimits.durationSeconds) * 1000;
      const duration = end - start;
      if (duration > 0 && appearance.entranceAnimations) {
        try {
          const tempo = Math.min(1, duration / 4200);
          const fadeStart = duration - Math.min(650, duration * 0.2);
          // Begin just beyond the canvas edges, regardless of the subject's size.
          const photo = stingerFraming.photo;
          const character = stingerFraming.character;
          const photoSlide = -((photo.x + photo.width + 64) / photo.width) * 100;
          const characterSlide = ((1920 - character.x + 64) / character.width) * 100;
          const subjects = [
            {
              selector: '.stinger-photo',
              delay: 0,
              entrance: 2000,
              from: `translate3d(${photoSlide}%, 0, 0) scale(0.96)`,
              scale: 1.035
            },
            {
              selector: '.stinger-character',
              delay: 240,
              entrance: 2200,
              from: `translate3d(${characterSlide}%, 0, 0) scale(0.96)`,
              scale: 1.045
            },
            {
              selector: '.stinger-name',
              delay: 650,
              entrance: 1000,
              from: 'translate3d(0, -25%, 0) scale(0.98)',
              scale: 1
            }
          ];
          for (const subject of subjects) {
            const element = root.querySelector<HTMLElement>(subject.selector);
            if (!element) continue;
            const delay = subject.delay * tempo;
            const settled = delay + subject.entrance * tempo;
            const frames: Keyframe[] = [
              { offset: 0, opacity: 0, transform: subject.from },
              ...(delay ? [{ offset: delay / duration, opacity: 0, transform: subject.from }] : []),
              { offset: settled / duration, opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
              { offset: fadeStart / duration, opacity: 1, transform: `scale(${subject.scale})` },
              { offset: 1, opacity: 0, transform: `scale(${subject.scale === 1 ? 1 : subject.scale + 0.005})` }
            ];
            // Ease the entrance, then let the push-in and shared fade run steadily.
            frames[delay ? 1 : 0].easing = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
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
    function play() {
      started = true;
      running = true;
      sync();
    }
    function pause() {
      running = false;
      sync();
    }
    const events: Array<[string, () => void]> = [
      ['playing', play],
      ['waiting', pause],
      ['pause', pause],
      ['seeking', pause],
      [
        'seeked',
        () => {
          running = !video.paused;
          sync();
        }
      ],
      ['ended', pause],
      ['timeupdate', sync],
      ['ratechange', sync],
      ['loadedmetadata', rebuild],
      ['durationchange', rebuild]
    ];
    for (const [event, listener] of events) video.addEventListener(event, listener);
    rebuild();
    return () => {
      clearTimeout(boundary);
      for (const [event, listener] of events) video.removeEventListener(event, listener);
      clearAnimations();
      root.style.visibility = 'hidden';
    };
  }, [videoRef, ready, mediaDelaySeconds, durationSeconds, appearance.entranceAnimations]);

  return rootRef;
}
