import type { EntranceCue } from './overlayEntrance';

export const resultScreenEntrance: readonly EntranceCue[] = [
  { target: 'result-layout', from: { scale: 1.025 }, duration: 950, fade: true },
  { target: 'result-logo', from: { y: -36, scale: 0.9 }, delay: 150, duration: 1050, fade: true },
  { target: 'result-kicker', from: { x: -60 }, delay: 250, duration: 900, fade: true },
  { target: 'result-sponsor', from: { y: 28 }, delay: 400, duration: 1000, fade: true },
  { target: 'result-name', from: { x: -90 }, delay: 500, duration: 1200, fade: true },
  { target: 'result-round', from: { y: 28 }, delay: 850, duration: 850, fade: true },
  { target: 'result-character-label', from: { y: 28 }, delay: 850, duration: 850, fade: true },
  // Artwork arrives after the winner's name and reveals color once it settles.
  {
    target: 'result-character',
    from: { x: 100, scale: 0.97 },
    delay: 1800,
    duration: 2000,
    movementDuration: 650,
    fade: true,
    silhouette: true
  },
  {
    target: 'result-photo',
    from: { y: 70, scale: 0.97 },
    delay: 2000,
    duration: 2000,
    movementDuration: 650,
    fade: true,
    silhouette: true
  },
  { target: 'result-portraits', from: { x: 40 }, delay: 2100, duration: 1200, fade: true },
  { target: 'result-placeholder', from: { scale: 0.9 }, delay: 1600, duration: 2200, fade: true }
];
