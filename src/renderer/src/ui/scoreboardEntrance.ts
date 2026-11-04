import type { EntranceCue } from './overlayEntrance';

const slideDuration = 1680;

export const scoreboardEntrance: readonly EntranceCue[] = [
  { target: 'player-left', from: 'left', duration: slideDuration },
  { target: 'player-right', from: 'right', duration: slideDuration },
  { target: 'details-left', from: 'left', delay: 120, duration: slideDuration },
  { target: 'details-right', from: 'right', delay: 120, duration: slideDuration },
  { target: 'round', from: 'top', delay: 80, duration: slideDuration },
  { target: 'rail-left', from: 'left', delay: 100, duration: slideDuration },
  { target: 'rail-right', from: 'right', delay: 100, duration: slideDuration },
  { target: 'rail-center', from: 'bottom', delay: 160, duration: slideDuration }
];
