import type { EntranceCue } from './overlayEntrance';

export const customScoreboardEntrance: readonly EntranceCue[] = [
  'custom-frame',
  'custom-scoreboard',
  'character-name-left',
  'character-name-right'
].map((target) => ({
  target,
  from: { y: 160 },
  fade: true,
  duration: 2400,
  ease: 'inOutSine'
}));
