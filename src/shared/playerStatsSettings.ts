import { z } from 'zod';
import { canonicalGameId, type GameId } from './gameProfiles';

export const playerStatsSettingsSchema = z.object({
  // Unset choices follow the live match style and rails logo independently.
  stylingGameId: z.custom<GameId>((value) => typeof value === 'string' && canonicalGameId(value) === value).optional(),
  logoAssetId: z.string().trim().min(1).max(255).optional(),
  showBackground: z.boolean().default(true),
  showTournamentLogo: z.boolean().default(true),
  showPlacementLogos: z.boolean().default(true),
  showSponsorLogo: z.boolean().default(true),
  showPlayerPhoto: z.boolean().default(true),
  showCharacter: z.boolean().default(true),
  updatedAt: z.string().datetime({ offset: true })
});

export type PlayerStatsSettings = z.infer<typeof playerStatsSettingsSchema>;

export function parsePlayerStatsSettingsRealtime(value: unknown): PlayerStatsSettings | undefined {
  const result = z
    .object({ event: z.literal('player-stats-settings'), payload: playerStatsSettingsSchema })
    .safeParse(value);
  return result.success ? result.data.payload : undefined;
}
