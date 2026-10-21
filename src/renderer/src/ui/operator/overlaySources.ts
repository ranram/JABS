import type { LocalHandoffUrl } from '../../desktopRuntime';

type PublicOverlayKind = Exclude<LocalHandoffUrl, 'champion'>;

/** Group OBS sources by their settings panel. The old Champion URL has no separate panel. */
export const overlaySources = {
  versus: ['versus'],
  playerStats: ['stats-player-1', 'stats-player-2'],
  winner: ['winner'],
  commentators: ['commentators'],
  topEightMatchups: ['top-eight-matchups'],
  bracket: ['bracket']
} as const satisfies Record<string, readonly PublicOverlayKind[]>;

export type OtherOverlayType = keyof typeof overlaySources;
export const otherOverlayTypes = Object.keys(overlaySources) as OtherOverlayType[];
export const publicOverlayKinds: readonly PublicOverlayKind[] = ['score', 'stingers', ...Object.values(overlaySources).flat()];
