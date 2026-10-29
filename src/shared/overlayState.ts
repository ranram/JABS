import { utf16AtMost } from './schemaText';
import { z } from 'zod';
import { canonicalGameId, gameProfiles, scoreLimitForMatch, type GameId } from './gameProfiles';
import { isSafeGameAssetCatalogSlug } from './gameAssetCatalog';
import type { OverlayState } from './models';

const gameIds = Object.keys(gameProfiles) as [GameId, ...GameId[]];
const requiredId = z.string().trim().min(1, 'Identifiers cannot be empty.');
const optionalDisplayText = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }
  return value.trim() || undefined;
}, z.string().optional());

const logoAssetId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i, 'Choose a valid local logo asset.');

export const broadcastPresentationSchema = z.object({
  seedsEnabled: z.boolean().optional(),
  infoBarEnabled: z.boolean().default(false),
  infoLeft: optionalDisplayText,
  infoRight: optionalDisplayText,
  logoEnabled: z.boolean().default(false),
  logoAssetId: logoAssetId.optional()
});

export const playerStateSchema = z.object({
  localPlayerId: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
  playerPhotoAssetId: z.string().refine(utf16AtMost(255)).optional(),
  portraitAssetId: z.string().refine(utf16AtMost(255)).optional(),
  entrantId: requiredId,
  playerId: requiredId.optional(),
  name: z.string().trim().min(1, 'Player names cannot be empty.'),
  prefix: optionalDisplayText,
  sponsor: optionalDisplayText,
  xHandle: optionalDisplayText,
  characters: z.array(z.string().trim().min(1)).max(4).optional(),
  character: optionalDisplayText,
  characterAssetId: z.string().trim().min(1).refine(utf16AtMost(255)).optional(),
  country: optionalDisplayText,
  displayFlag: z
    .string()
    .trim()
    .regex(/^pride:[a-z0-9-]+$/)
    .optional(),
  state: optionalDisplayText,
  pronouns: optionalDisplayText,
  seed: z.number().int().positive('Seeds must be positive whole numbers.').optional(),
  score: z.number().int().min(0)
});

export const setGameResultSchema = z.object({
  winnerId: requiredId,
  selections: z
    .array(
      z.object({
        entrantId: requiredId,
        character: z.string().trim().min(1).refine(utf16AtMost(100))
      })
    )
    .max(8)
    .optional()
});

export const selectedSetStateSchema = z
  .object({
    upstreamReset: z.boolean().optional(),
    reportedOutcome: z
      .object({
        kind: z.enum(['win-loss', 'disqualification']),
        winnerId: requiredId
      })
      .optional(),
    setId: requiredId.optional(),
    eventId: requiredId.optional(),
    tournamentSlug: requiredId.optional(),
    tournamentName: optionalDisplayText,
    displayName: z.string().trim().min(1, 'Display name cannot be empty.'),
    phase: optionalDisplayText,
    phaseGroup: optionalDisplayText,
    round: optionalDisplayText,
    winnersSideEntrantId: requiredId.optional(),
    station: optionalDisplayText,
    state: optionalDisplayText,
    gameId: z.preprocess(
      (value) => (typeof value === 'string' ? (canonicalGameId(value) ?? value) : value),
      z.enum(gameIds)
    ),
    gameName: optionalDisplayText,
    videogameId: requiredId.optional(),
    stylingGameId: z.preprocess(
      (value) => (typeof value === 'string' ? (canonicalGameId(value) ?? value) : value),
      z.enum(gameIds).optional()
    ),
    customScoreboardId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
      .optional(),
    customScoreboardRevision: z.string().min(1).refine(utf16AtMost(64)).optional(),
    assetCatalogSlug: z
      .string()
      .refine(isSafeGameAssetCatalogSlug, 'Choose a valid local game asset catalog.')
      .optional(),
    matchFormat: z.enum(['best-of', 'first-to', 'topanga']).optional().default('best-of'),
    bestOf: z
      .number()
      .int()
      .refine((value) => [3, 5, 9, 13, 19].includes(value), 'Choose a supported match length.')
      .default(3),
    broadcast: broadcastPresentationSchema.optional(),
    gameHistory: z.array(setGameResultSchema).max(99).optional(),
    playerOne: playerStateSchema,
    playerTwo: playerStateSchema,
    updatedAt: z.string().datetime()
  })
  .superRefine((selectedSet, context) => {
    if (
      selectedSet.reportedOutcome &&
      ![selectedSet.playerOne.entrantId, selectedSet.playerTwo.entrantId].includes(selectedSet.reportedOutcome.winnerId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reportedOutcome', 'winnerId'],
        message: 'Choose the winning entrant.'
      });
    }
    if (selectedSet.matchFormat === 'best-of' && ![3, 5].includes(selectedSet.bestOf)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bestOf'],
        message: 'Best-of must be 3 or 5.'
      });
    }
    if (
      selectedSet.matchFormat === 'topanga' &&
      (selectedSet.bestOf !== 13 || selectedSet.setId || selectedSet.eventId || selectedSet.tournamentSlug)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['matchFormat'],
        message: 'Topanga Rules are for exhibitions: first to 7, win by two, up to 10.'
      });
    }
    const scoreLimit = scoreLimitForMatch(selectedSet);
    for (const side of ['playerOne', 'playerTwo'] as const) {
      if (selectedSet[side].score > scoreLimit) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [side, 'score'],
          message: 'Score exceeds the selected match length.'
        });
      }
    }
    if (
      selectedSet.winnersSideEntrantId !== undefined &&
      selectedSet.winnersSideEntrantId !== selectedSet.playerOne.entrantId &&
      selectedSet.winnersSideEntrantId !== selectedSet.playerTwo.entrantId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['winnersSideEntrantId'],
        message: 'The winners-side entrant must be one of the selected set entrants.'
      });
    }
    if (selectedSet.gameHistory === undefined) return;

    const playerOneWins = selectedSet.gameHistory.filter(
      (game) => game.winnerId === selectedSet.playerOne.entrantId
    ).length;
    const playerTwoWins = selectedSet.gameHistory.filter(
      (game) => game.winnerId === selectedSet.playerTwo.entrantId
    ).length;
    const hasUnknownWinner = selectedSet.gameHistory.some(
      (game) => game.winnerId !== selectedSet.playerOne.entrantId && game.winnerId !== selectedSet.playerTwo.entrantId
    );
    const hasUnknownSelectionEntrant = selectedSet.gameHistory.some((game) =>
      game.selections?.some(
        (selection) =>
          selection.entrantId !== selectedSet.playerOne.entrantId &&
          selection.entrantId !== selectedSet.playerTwo.entrantId
      )
    );

    if (
      hasUnknownWinner ||
      hasUnknownSelectionEntrant ||
      playerOneWins !== selectedSet.playerOne.score ||
      playerTwoWins !== selectedSet.playerTwo.score
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gameHistory'],
        message: 'Recorded game history must exactly match both entrant IDs and displayed scores.'
      });
    }
  });

export const overlayStateSchema = z.object({
  selectedSet: selectedSetStateSchema
});

export function parseOverlayState(value: unknown): OverlayState | undefined {
  const result = overlayStateSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
