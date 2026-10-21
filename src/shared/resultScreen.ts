import { z } from 'zod';
import { canonicalGameId, type GameId } from './gameProfiles';

const stylingGameIdSchema = z.custom<GameId>(
  (value) => typeof value === 'string' && canonicalGameId(value) === value
);

export const resultScreenStateSchema = z.object({
  composition: z.enum(['classic', 'victory', 'spotlight']).default('classic'),
  stylingGameId: stylingGameIdSchema,
  logoAssetId: z.string().trim().min(1).max(255).optional(),
  showBackground: z.boolean().default(true),
  showTextBackdrop: z.boolean().default(false),
  showTournamentLogo: z.boolean(),
  showPlayerPhoto: z.boolean(),
  showSponsorLogo: z.boolean(),
  showCharacter: z.boolean(),
  updatedAt: z.string().datetime({ offset: true })
});

export type ResultScreenState = z.infer<typeof resultScreenStateSchema>;

export function parseResultScreenRealtime(value: unknown): ResultScreenState | undefined {
  const message = z.object({
    event: z.literal('result-screen-state'),
    payload: resultScreenStateSchema
  }).safeParse(value);
  return message.success ? message.data.payload : undefined;
}
