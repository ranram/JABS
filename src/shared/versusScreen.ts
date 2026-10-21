import type { SelectedSetState } from './models';
import { z } from 'zod';
import { canonicalGameId, type GameId } from './gameProfiles';
import {
  defaultPlayerMediaPlacement,
  mediaTransformSchema,
  playerMediaModeIds,
  type PlayerMediaPlacement
} from './mediaPlacement';

const stylingGameIdSchema = z.custom<GameId>((value) => typeof value === 'string' && canonicalGameId(value) === value);

export const placementSchema = z.object({
  placement: z.number().int().positive(),
  tournamentName: z.string().trim().min(1),
  eventName: z.string().trim().min(1)
});

const headToHeadSchema = z.object({
  setId: z.string().optional(),
  round: z.string().optional(),
  phase: z.string().optional(),
  tournamentName: z.string().trim().min(1),
  eventName: z.string().trim().min(1),
  completedAt: z.number().int().nonnegative().optional(),
  playerOneScore: z.number().int().nonnegative(),
  playerTwoScore: z.number().int().nonnegative()
});

const playerMediaPlacementSchema = z.object({
  character: mediaTransformSchema,
  photo: mediaTransformSchema
});

export const versusHistorySchema = z.object({
  tournamentName: z.string().optional(),
  playerOnePlacements: z.array(placementSchema).max(3),
  playerTwoPlacements: z.array(placementSchema).max(3),
  headToHead: z.array(headToHeadSchema).max(4)
});

export const versusStatTypes = ['age', 'sponsor', 'seed', 'nickname'] as const;
export type VersusStat = (typeof versusStatTypes)[number];
const statRowsSchema = z
  .array(z.enum(versusStatTypes))
  .max(4)
  .refine((rows) => new Set(rows).size === rows.length, 'Choose each stat only once.');

export function setVersusStatRow(rows: VersusStat[], index: number, value?: VersusStat): VersusStat[] {
  const next = [...rows];
  if (!value) return next.filter((_, row) => row !== index);
  const previous = next.indexOf(value);
  if (previous !== -1 && previous !== index) {
    const displaced = next[index];
    if (displaced) next[previous] = displaced;
    else next.splice(previous, 1);
  }
  next[Math.min(index, next.length)] = value;
  return next;
}

export const versusScreenStateSchema = z.object({
  stylingGameId: stylingGameIdSchema,
  logoAssetId: z.string().trim().min(1).max(255).optional(),
  showBackground: z.boolean().default(true),
  showMatchBackdrop: z.boolean().default(true),
  showTournamentLogo: z.boolean(),
  showSponsorLogos: z.boolean(),
  showHeadToHead: z.boolean().default(true),
  statRows: statRowsSchema.default(() => [...versusStatTypes]),
  mediaMode: z.enum(playerMediaModeIds),
  mediaPlacements: z
    .tuple([playerMediaPlacementSchema, playerMediaPlacementSchema])
    .default(
      () =>
        [defaultPlayerMediaPlacement(), defaultPlayerMediaPlacement()] as [PlayerMediaPlacement, PlayerMediaPlacement]
    ),
  history: versusHistorySchema.optional(),
  historyMatch: z
    .object({
      setId: z.string().optional(),
      eventId: z.string().optional(),
      gameId: z.string(),
      playerOneId: z.string(),
      playerTwoId: z.string()
    })
    .optional(),
  historyLoading: z.boolean().optional(),
  historyError: z.string().optional(),
  updatedAt: z.string().datetime({ offset: true })
});

export type VersusHistory = z.infer<typeof versusHistorySchema>;
export type VersusScreenState = z.infer<typeof versusScreenStateSchema>;

export function versusHistoryMatch(set?: SelectedSetState): VersusScreenState['historyMatch'] {
  const one = set?.playerOne.playerId;
  const two = set?.playerTwo.playerId;
  if (!set || !one || !two || one === two || (set.setId ? !set.eventId : !set.videogameId)) return undefined;
  return {
    setId: set.setId,
    eventId: set.setId ? set.eventId : undefined,
    gameId: set.videogameId ?? set.assetCatalogSlug ?? set.gameId,
    playerOneId: one,
    playerTwoId: two
  };
}

export function versusPresentationMode(set?: SelectedSetState): 'waiting' | 'exhibition' | 'tournament' {
  if (set?.setId) return 'tournament';
  // The reset state has a scoring profile, but no selected exhibition game.
  if (set?.videogameId || set?.assetCatalogSlug || set?.gameName?.trim()) return 'exhibition';
  return 'waiting';
}

export function parseVersusScreenRealtime(value: unknown): VersusScreenState | undefined {
  const message = z
    .object({
      event: z.literal('versus-screen-state'),
      payload: versusScreenStateSchema
    })
    .safeParse(value);
  return message.success ? message.data.payload : undefined;
}

// The stream and history arrive over separate messages. Hide history from the
// previous matchup even if its clearing message has not reached OBS yet.
export function historyForMatch(settings: VersusScreenState, set?: SelectedSetState): VersusHistory | undefined {
  const owner = settings.historyMatch;
  const match = versusHistoryMatch(set);
  if (!owner || !match) return undefined;
  return owner.setId === match.setId &&
    owner.eventId === match.eventId &&
    owner.gameId === match.gameId &&
    owner.playerOneId === match.playerOneId &&
    owner.playerTwoId === match.playerTwoId
    ? settings.history
    : undefined;
}
