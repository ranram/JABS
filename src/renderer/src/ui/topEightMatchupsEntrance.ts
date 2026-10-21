import type { EntranceCue } from './overlayEntrance';

// Let the bracket details appear first, then reveal each pair together.
export const topEightMatchupsEntrance: readonly EntranceCue[] = Array.from({ length: 8 }, (_, index) => ({
  target: `portrait-${index}`,
  from: index % 2 === 0 ? 'left' : 'right',
  boundary: 'parent',
  delay: 650 + Math.floor(index / 2) * 50,
  duration: 2000,
  movementDuration: 700,
  fade: true,
  silhouette: true
}));
