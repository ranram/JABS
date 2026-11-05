import { useLayoutEffect, useRef, type RefObject } from 'react';
import { stingerLimits } from '@shared/stingers';

export type StingerPlaybackClock = {
  time(): number;
  duration(): number;
  rate(): number;
  running(): boolean;
  started(): boolean;
  finished(): boolean;
  subscribe(listener: (durationChanged: boolean) => void): () => void;
};

/** Follow video playback, then continue the winner hold after its final frame. */
export function useStingerPlaybackClock(
  videoRef: RefObject<HTMLVideoElement | null>,
  limit?: number,
  holdLastFrame = false
) {
  const clockRef = useRef<StingerPlaybackClock | null>(null);
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const listeners = new Set<(durationChanged: boolean) => void>();
    let running = !video.paused && !video.seeking;
    let started = running;
    let ended = video.ended;
    let tail: { time: number; since: number; rate: number } | undefined;
    const time = () => (tail ? tail.time + ((performance.now() - tail.since) / 1000) * tail.rate : video.currentTime);
    const duration = () => {
      const natural =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : stingerLimits.durationSeconds;
      return holdLastFrame && limit !== undefined ? limit : Math.min(natural, limit ?? stingerLimits.durationSeconds);
    };
    const notify = (durationChanged = false) => listeners.forEach((listener) => listener(durationChanged));
    const clock: StingerPlaybackClock = {
      time,
      duration,
      rate: () => tail?.rate ?? video.playbackRate,
      running: () => running,
      started: () => started,
      finished: () => ended || time() >= duration(),
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    };
    clockRef.current = clock;
    const play = () => {
      tail = undefined;
      running = true;
      started = true;
      ended = false;
      notify();
    };
    const pause = () => {
      if (tail) return;
      running = false;
      notify();
    };
    const finishVideo = () => {
      if (holdLastFrame && limit !== undefined && video.currentTime < limit) {
        tail = { time: video.currentTime, since: performance.now(), rate: video.playbackRate };
        running = true;
        started = true;
        ended = false;
      } else {
        running = false;
        ended = true;
      }
      notify();
    };
    const events: Array<[string, () => void]> = [
      ['playing', play],
      ['pause', pause],
      ['waiting', pause],
      ['ended', finishVideo],
      [
        'seeking',
        () => {
          tail = undefined;
          ended = false;
          running = false;
          notify();
        }
      ],
      [
        'seeked',
        () => {
          running = !video.paused && !video.seeking;
          ended = video.ended;
          notify();
        }
      ],
      [
        'ratechange',
        () => {
          if (tail) tail = { time: time(), since: performance.now(), rate: video.playbackRate };
          notify();
        }
      ],
      ['timeupdate', () => notify()],
      ['loadedmetadata', () => notify(true)],
      ['durationchange', () => notify(true)]
    ];
    for (const [event, listener] of events) video.addEventListener(event, listener);
    return () => {
      for (const [event, listener] of events) video.removeEventListener(event, listener);
      listeners.clear();
      if (clockRef.current === clock) clockRef.current = null;
    };
  }, [videoRef, limit, holdLastFrame]);
  return clockRef;
}
