import type { EntranceCue } from '../overlayEntrance';
import { highlightImpactCues } from './highlightImpacts';

export const highlightConfettiAt = 2800;

const entrances: readonly EntranceCue[] = [
  {
    target: 'victory-character',
    from: { scale: 1.7, y: -120 },
    delay: 300,
    duration: 220,
    fade: true,
    ease: 'cubic-bezier(0.16, 1, 0.3, 1)'
  },
  {
    target: 'victory-photo',
    from: { scale: 1.55, y: -90 },
    delay: 900,
    duration: 220,
    fade: true,
    ease: 'cubic-bezier(0.16, 1, 0.3, 1)'
  },
  { target: 'highlight-name', from: 'top', delay: 1550, duration: 450 },
  { target: 'highlight-sponsor', from: { scale: 1.25 }, duration: 500, fade: true },
  { target: 'highlight-title', from: 'bottom', delay: 2350, duration: 450, fade: true },
  { target: 'highlight-logo', from: { y: -80 }, delay: 150, duration: 350, fade: true }
];

export const highlightEntrance: readonly EntranceCue[] = [...entrances, ...highlightImpactCues(entrances)];
