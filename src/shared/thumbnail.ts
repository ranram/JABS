import { gameProfiles, type GameId } from './gameProfiles';

export const thumbnailStyleIds = ['versus', 'spotlight'] as const;
export type ThumbnailStyleId = (typeof thumbnailStyleIds)[number];
export const thumbnailMediaModeIds = ['character', 'photo'] as const;
export type ThumbnailMediaMode = (typeof thumbnailMediaModeIds)[number];

export type ThumbnailPlayer = {
  name: string;
  character?: string;
  characters?: string[];
  characterAssetId?: string;
  sponsor?: string;
  country?: string;
  displayFlag?: string;
};

export type ThumbnailDraft = {
  gameId?: GameId;
  gameName: string;
  assetCatalogSlug: string;
  stylingGameId: GameId;
  style: ThumbnailStyleId;
  tournamentName: string;
  headline: string;
  logoAssetId?: string;
  mediaMode: ThumbnailMediaMode;
  showTournamentLogo: boolean;
  showSponsorLogo: boolean;
  players: [ThumbnailPlayer, ThumbnailPlayer];
};

export function createThumbnailDraft(gameId: GameId = 'street-fighter-6'): ThumbnailDraft {
  return {
    gameId,
    gameName: gameProfiles[gameId].label,
    assetCatalogSlug: gameId,
    stylingGameId: gameId,
    style: 'versus',
    tournamentName: 'Tournament Match',
    headline: 'Featured Set',
    mediaMode: 'character',
    showTournamentLogo: true,
    showSponsorLogo: true,
    players: [{ name: 'Player 1' }, { name: 'Player 2' }]
  };
}

export function validateThumbnailDraft(draft: ThumbnailDraft): boolean {
  return Boolean(
    draft.tournamentName.trim()
    && draft.headline.trim()
    && draft.players.every((player) => player.name.trim())
  );
}

export function thumbnailMatchHeadline(
  context: { phase?: string; phaseGroup?: string; round?: string }
): string {
  return [context.phase, context.round].filter(Boolean).join(' · ');
}
