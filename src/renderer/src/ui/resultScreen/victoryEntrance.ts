import type { EntranceCue } from '../overlayEntrance';

export const resultOpeningEntrance: EntranceCue = {
  target: 'victory-opening',
  from: { scale: 1.65, x: 240 },
  delay: 250,
  duration: 2400,
  transient: true,
  punch: true
};

export const resultCopyEntrance: EntranceCue = {
  target: 'victory-copy',
  from: { y: 24 },
  delay: 2150,
  duration: 700,
  fade: true
};

// Establish a silhouette under the opening announcement. At 2.5 seconds,
// the shadow separates, color returns, and the winner's identity takes over.
export const victoryEntrance: readonly EntranceCue[] = [
  { target: 'victory-ground', from: {}, duration: 1000, fade: true },
  { target: 'victory-band', from: 'left', delay: 150, duration: 1600 },
  resultOpeningEntrance,
  resultCopyEntrance,
  { target: 'victory-impact', from: { x: -1600 }, delay: 2350, duration: 850, transient: true },
  {
    target: 'victory-character',
    from: { scale: 1.25 },
    delay: 400,
    duration: 3900,
    movementDuration: 2100,
    fade: true,
    silhouette: true
  },
  {
    target: 'victory-photo',
    from: { scale: 1.2 },
    delay: 400,
    duration: 3900,
    movementDuration: 2100,
    fade: true,
    silhouette: true
  },
  { target: 'victory-character-shadow', from: { x: 32, y: -12 }, delay: 2500, duration: 1800, fade: true },
  { target: 'victory-photo-shadow', from: { x: 32, y: -12 }, delay: 2500, duration: 1800, fade: true },
  { target: 'victory-title', from: { x: -320, scale: 1.25 }, delay: 2350, duration: 1000, fade: true, punch: true },
  { target: 'victory-name', from: { x: -400, scale: 1.2 }, delay: 2550, duration: 1150, fade: true, punch: true },
  { target: 'victory-details', from: { x: -90 }, delay: 2900, duration: 1000, fade: true },
  { target: 'victory-logo', from: { x: 50 }, delay: 3100, duration: 900, fade: true },
  { target: 'victory-sponsor', from: { y: 35 }, delay: 3200, duration: 900, fade: true },
  { target: 'victory-portraits', from: { y: 60 }, delay: 3200, duration: 1100, fade: true }
];
