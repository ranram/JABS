import type { EntranceCue } from './overlayEntrance';

export const customScoreboardEntrance: readonly EntranceCue[] = ['custom-frame', 'custom-scoreboard'].map((target) => ({
  target,
  from: { y: 160 },
  fade: true,
  duration: 2400,
  ease: 'inOutSine'
}));
