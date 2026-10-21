import type { EntranceCue } from '../overlayEntrance';

// A Spotlight reveal, without the result overlay's WINNER announcement.
export const statsEntrance: readonly EntranceCue[] = [
  {
    target: 'victory-character',
    from: { scale: 1.04 },
    duration: 2200,
    movementDuration: 1000,
    fade: true,
    silhouette: true
  },
  {
    target: 'victory-photo',
    from: { y: 24 },
    delay: 150,
    duration: 2200,
    movementDuration: 1000,
    fade: true,
    silhouette: true
  },
  { target: 'stats-logo', from: { y: -16 }, delay: 200, duration: 700, fade: true },
  { target: 'stats-identity', from: { y: 24 }, delay: 700, duration: 900, fade: true },
  { target: 'stats-placements', from: { x: 40 }, delay: 950, duration: 900, fade: true },
  { target: 'stats-run', from: { x: 40 }, delay: 1200, duration: 900, fade: true }
];
