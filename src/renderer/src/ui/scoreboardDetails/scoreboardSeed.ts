import type { SelectedSetState } from '@shared/models';

// Temporary visual-review switch. Disable after the exhibition pill review.
export const previewExhibitionSeeds = true;

export function scoreboardSeed(set: SelectedSetState | undefined, index: number, visible = true): number | undefined {
  if (!set) return undefined;
  const player = index === 0 ? set.playerOne : set.playerTwo;
  if (!set.setId) return previewExhibitionSeeds ? (player.seed ?? index + 1) : undefined;
  return visible && set.broadcast?.seedsEnabled !== false ? player.seed : undefined;
}
