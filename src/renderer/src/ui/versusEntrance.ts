import type { EntranceCue } from './overlayEntrance';

export const versusEntrance: readonly EntranceCue[] = [
  { target: 'panel', from: { y: 48 }, duration: 650, fade: true },
  { target: 'frame', from: { scale: 0.96 }, duration: 700, fade: true },
  { target: 'ticker-left', from: { y: -24 }, delay: 150, duration: 600, fade: true },
  { target: 'ticker-right', from: { y: -24 }, delay: 150, duration: 600, fade: true },
  { target: 'name-left', from: 'left', duration: 600 },
  { target: 'name-right', from: 'right', duration: 600 },
  { target: 'heading', from: { y: 24 }, delay: 40, duration: 600, fade: true },
  { target: 'stats', from: { y: 24 }, delay: 100, duration: 550, fade: true },
  { target: 'h2h', from: { y: 24 }, delay: 160, duration: 550, fade: true },
  { target: 'format', from: { y: 24 }, delay: 160, duration: 550, fade: true },
  // Settle the match details before bringing in player artwork.
  { target: 'image-left', from: { x: -80 }, delay: 850, duration: 950, fade: true, silhouette: true },
  { target: 'image-right', from: { x: 80 }, delay: 850, duration: 950, fade: true, silhouette: true },
  { target: 'photo-left', from: { y: 64 }, delay: 1100, duration: 800, fade: true },
  { target: 'photo-right', from: { y: 64 }, delay: 1100, duration: 800, fade: true },
  { target: 'portraits-left', from: { x: -32 }, delay: 950, duration: 800, fade: true },
  { target: 'portraits-right', from: { x: 32 }, delay: 950, duration: 800, fade: true }
];
