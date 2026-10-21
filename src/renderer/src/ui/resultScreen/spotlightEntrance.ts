import type { EntranceCue } from '../overlayEntrance';
import { resultCopyEntrance, resultOpeningEntrance } from './victoryEntrance';

// The opening announcement clears into the clean identity and artwork reveal.
export const spotlightEntrance: readonly EntranceCue[] = [
  { target: 'victory-ground', from: {}, duration: 700, fade: true },
  resultOpeningEntrance,
  resultCopyEntrance,
  { target: 'victory-title', from: { x: -48 }, delay: 2350, duration: 900, fade: true },
  { target: 'victory-name', from: { x: -64 }, delay: 2550, duration: 1100, fade: true },
  { target: 'victory-details', from: { y: 18 }, delay: 2900, duration: 850, fade: true },
  {
    target: 'victory-character',
    from: { scale: 1.06 },
    delay: 400,
    duration: 3900,
    movementDuration: 2100,
    fade: true,
    silhouette: true
  },
  {
    target: 'victory-photo',
    from: { y: 24 },
    delay: 400,
    duration: 3900,
    movementDuration: 2100,
    fade: true,
    silhouette: true
  },
  { target: 'victory-logo', from: { y: -24 }, delay: 3100, duration: 900, fade: true },
  { target: 'victory-sponsor', from: { y: 18 }, delay: 3100, duration: 850, fade: true },
  { target: 'victory-portraits', from: { y: 18 }, delay: 3200, duration: 900, fade: true }
];
