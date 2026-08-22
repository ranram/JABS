import { z } from 'zod';
import { canonicalGameId, type GameId } from './gameProfiles';
import { defaultPlayerMediaPlacement, type PlayerMediaPlacement } from './mediaPlacement';

const stylingGameIdSchema = z.custom<GameId>(
  (value) => typeof value === 'string' && canonicalGameId(value) === value
);

const placementSchema = z.object({
  placement: z.number().int().positive(),
  tournamentName: z.string().trim().min(1),
  eventName: z.string().trim().min(1)
});

const headToHeadSchema = z.object({
  tournamentName: z.string().trim().min(1),
  eventName: z.string().trim().min(1),
  completedAt: z.number().int().nonnegative().optional(),
  playerOneScore: z.number().int().nonnegative(),
  playerTwoScore: z.number().int().nonnegative()
});

const mediaTransformSchema = z.object({
  x: z.number().finite().min(-0.85).max(0.85),
  y: z.number().finite().min(-0.85).max(0.85),
  scale: z.number().finite().min(0.35).max(2.5)
});
const playerMediaPlacementSchema = z.object({
  character: mediaTransformSchema,
  photo: mediaTransformSchema
});

export const versusHistorySchema = z.object({
  playerOnePlacements: z.array(placementSchema).max(3),
  playerTwoPlacements: z.array(placementSchema).max(3),
  headToHead: z.array(headToHeadSchema).max(6)
});

export const versusScreenStateSchema = z.object({
  stylingGameId: stylingGameIdSchema,
  showTournamentLogo: z.boolean(),
  showSponsorLogos: z.boolean(),
  mediaMode: z.enum(['character', 'photo']),
  mediaPlacements: z.tuple([playerMediaPlacementSchema, playerMediaPlacementSchema])
    .default(() => [defaultPlayerMediaPlacement(), defaultPlayerMediaPlacement()] as [PlayerMediaPlacement, PlayerMediaPlacement]),
  history: versusHistorySchema.optional(),
  updatedAt: z.string().datetime({ offset: true })
});

export type VersusHistory = z.infer<typeof versusHistorySchema>;
export type VersusScreenState = z.infer<typeof versusScreenStateSchema>;

export function parseVersusScreenRealtime(value: unknown): VersusScreenState | undefined {
  const message = z.object({
    event: z.literal('versus-screen-state'),
    payload: versusScreenStateSchema
  }).safeParse(value);
  return message.success ? message.data.payload : undefined;
}
