import { z } from 'zod';
import { gameProfiles } from './gameProfiles';

export const queueTickerSettingsSchema = z
  .object({
    enabled: z.boolean(),
    stylingGameId: z
      .string()
      .refine((id) => Object.hasOwn(gameProfiles, id))
      .optional(),
    style: z.enum(['standard', 'compact']).default('compact'),
    upcomingCount: z.number().int().min(1).max(3),
    showResults: z.boolean(),
    showLogo: z.boolean().default(false),
    logoAssetId: z
      .string()
      .min(1)
      .max(255)
      .refine((id) => !/[\\/\0]/u.test(id) && id !== '..')
      .optional(),
    updatedAt: z.string()
  })
  .strict();
const match = z.object({
  setId: z.string(),
  playerOne: z.string(),
  playerTwo: z.string(),
  round: z.string().nullable(),
  phase: z.string().nullable().optional()
});
export const queueTickerSnapshotSchema = z.object({
  settings: queueTickerSettingsSchema,
  upcoming: z.array(match).max(3),
  results: z.array(match.extend({ scoreOne: z.string(), scoreTwo: z.string(), winner: z.enum(['one', 'two']) })).max(3)
});
export type QueueTickerSettings = z.infer<typeof queueTickerSettingsSchema>;
export type QueueTickerSnapshot = z.infer<typeof queueTickerSnapshotSchema>;
