import type { EntranceCue } from './overlayEntrance';

// Opening rounds enter first; later columns follow toward the finals.
export const bracketScreenEntrance: readonly EntranceCue[] = [
  { target: 'bracket-heading', from: { y: -24 }, fade: true, duration: 2000 },
  ...(['winners', 'losers'] as const).flatMap((side, lane) =>
    Array.from({ length: 24 }, (_, column) => ({
      target: `${side}-column-${column}`,
      from: { x: 48 },
      fade: true,
      delay: 120 + lane * 120 + column * 90,
      duration: 2200
    }))
  ),
  { target: 'winners-connections', from: {}, fade: true, delay: 600, duration: 1900 },
  { target: 'losers-connections', from: {}, fade: true, delay: 720, duration: 1900 },
  { target: 'winners-advances', from: { x: 24 }, fade: true, delay: 800, duration: 1900 },
  { target: 'losers-advances', from: { x: 24 }, fade: true, delay: 920, duration: 1900 }
];
