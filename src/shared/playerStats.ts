import { z } from 'zod';
import type { SelectedSetState } from './models';
import { placementSchema } from './versusScreen';

export const statsContextSchema = z.object({
  eventId: z.string().optional(),
  gameId: z.string(),
  playerId: z.string().optional(),
  entrantId: z.string()
});

export const playerStatsSchema = z.object({
  context: statsContextSchema,
  tournamentName: z.string(),
  placements: z
    .array(
      placementSchema.extend({
        logoAssetId: z.string().optional(),
        numEntrants: z.number().int().positive().optional()
      })
    )
    .max(5),
  run: z.array(
    z.object({
      id: z.string(),
      opponent: z.string(),
      eventName: z.string(),
      phase: z.string(),
      round: z.string(),
      outcome: z.enum(['win', 'loss', 'unknown']),
      playerScore: z.number().int().nonnegative().optional(),
      opponentScore: z.number().int().nonnegative().optional(),
      playerDq: z.boolean(),
      opponentDq: z.boolean(),
      completedAt: z.number().nonnegative().optional()
    })
  ),
  runScope: z.enum(['tournament', 'event', 'none']),
  runComplete: z.boolean(),
  placementsError: z.string().optional(),
  runError: z.string().optional()
});

export type PlayerStats = z.infer<typeof playerStatsSchema>;
export type StatsContext = z.infer<typeof statsContextSchema>;
export type StatsPlayer = 1 | 2;

export function statsContext(set: SelectedSetState, slot: StatsPlayer): StatsContext {
  const player = slot === 1 ? set.playerOne : set.playerTwo;
  return {
    eventId: set.eventId,
    gameId: set.videogameId ?? set.assetCatalogSlug ?? set.gameId,
    playerId: player.playerId,
    entrantId: player.entrantId
  };
}

export function statsContextKey(context: StatsContext): string {
  return JSON.stringify([context.eventId, context.gameId, context.playerId, context.entrantId]);
}

// A missing selector is Player 1. Invalid selectors must not silently show someone else.
export function statsPlayerFromSearch(search: string): StatsPlayer | undefined {
  const players = new URLSearchParams(search).getAll('player');
  if (!players.length) return 1;
  return players.length === 1 && (players[0] === '1' || players[0] === '2')
    ? (Number(players[0]) as StatsPlayer)
    : undefined;
}
