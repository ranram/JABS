import type { GameId } from './gameProfiles';
import type { OverlayState } from './models';

export function createTestOverlayState(gameId: GameId = 'street-fighter-6'): OverlayState {
  return {
    selectedSet: {
      displayName: 'Waiting for set',
      gameId,
      assetCatalogSlug: gameId,
      bestOf: 3,
      matchFormat: 'best-of',
      broadcast: { infoBarEnabled: false, logoEnabled: false },
      gameHistory: [],
      playerOne: { entrantId: 'p1', name: 'Player 1', score: 0 },
      playerTwo: { entrantId: 'p2', name: 'Player 2', score: 0 },
      updatedAt: '2026-08-12T00:00:00.000Z'
    }
  };
}
