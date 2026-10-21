import type { EntranceCue } from '../overlayEntrance';

export const scoreboardPhotoEntrance: readonly EntranceCue[] = [
  ...(['left', 'right'] as const).flatMap((side): EntranceCue[] => [
    { target: `scoreboard-photo-${side}`, from: { y: -72 }, duration: 2700, ease: 'inOutSine' },
    { target: `scoreboard-photo-${side}-subject`, from: {}, silhouette: true, revealDelay: 1150, duration: 2700 }
  ])
];
