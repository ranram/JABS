import type { SelectedSetState } from '@shared/models';

export function scoreboardSeed(set: SelectedSetState | undefined, index: number, visible = true): number | undefined {
  if (!set?.setId) return undefined;
  const player = index === 0 ? set.playerOne : set.playerTwo;
  return visible && set.broadcast?.seedsEnabled !== false ? player.seed : undefined;
}
