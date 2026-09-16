import { gameProfiles, type GameId } from './gameProfiles';

export const topEightStyleIds = ['mosaic', 'neon'] as const;
export type TopEightStyleId = (typeof topEightStyleIds)[number];
export const topEightMediaModeIds = ['character', 'photo'] as const;
export type TopEightMediaMode = (typeof topEightMediaModeIds)[number];
export const conventionalTopEightPlacements = [1, 2, 3, 4, 5, 5, 7, 7] as const;

export function topEightMediaBaseScale(style: TopEightStyleId, placement: number): number {
  if (placement === 1) return 1;
  if (placement <= 3) return style === 'mosaic' ? 1.08 : 1.05;
  switch (style) {
    case 'neon': return 1.42;
    case 'mosaic': return 1.12;
  }
}

export type TopEightEntrant = {
  placement: number;
  name: string;
  character?: string;
  characters?: string[];
  characterAssetId?: string;
  sponsor?: string;
  xHandle?: string;
  country?: string;
  displayFlag?: string;
};

export type TopEightDraft = {
  gameId?: GameId;
  gameName: string;
  assetCatalogSlug: string;
  stylingGameId: GameId;
  style: TopEightStyleId;
  mediaMode: TopEightMediaMode;
  tournamentName: string;
  headline: string;
  headlineColor: string;
  eventUrl?: string;
  participantCount?: number;
  logoAssetId?: string;
  background?: {
    dataUrl: string;
    name: string;
  };
  entrants: TopEightEntrant[];
};

export type TopEightValidationCode =
  | 'entrantCount'
  | 'placements'
  | 'playerTag';

export function createTopEightDraft(gameId: GameId = 'street-fighter-6'): TopEightDraft {
  return {
    gameId,
    gameName: gameProfiles[gameId].label,
    assetCatalogSlug: gameId,
    stylingGameId: gameId,
    style: 'neon',
    mediaMode: 'character',
    tournamentName: 'Tournament Finals',
    headline: 'Top 8',
    headlineColor: '#ffffff',
    entrants: Array.from({ length: 8 }, (_, index) => ({
      placement: conventionalTopEightPlacements[index],
      name: `Player ${index + 1}`
    }))
  };
}

export function hasConventionalTopEightPlacements(
  entrants: ReadonlyArray<Pick<TopEightEntrant, 'placement'>>
): boolean {
  return entrants.length === conventionalTopEightPlacements.length && entrants.every(
    (entrant, index) => entrant.placement === conventionalTopEightPlacements[index]
  );
}

export function validateTopEightDraft(draft: TopEightDraft): TopEightValidationCode | undefined {
  if (draft.entrants.length !== 8) {
    return 'entrantCount';
  }
  if (!hasConventionalTopEightPlacements(draft.entrants)) {
    return 'placements';
  }
  if (draft.entrants.some((entrant) => !entrant.name.trim())) {
    return 'playerTag';
  }
  return undefined;
}
