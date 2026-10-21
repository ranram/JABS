import { z } from 'zod';
import { canonicalGameId, type GameId } from './gameProfiles';

const id = z.string().regex(/^\d{1,20}$/);
const setId = z.string().regex(/^(?:\d{1,20}|preview_[A-Za-z0-9_-]{1,80})$/);
export const bracketScopeSchema = z.object({ eventId: id, phaseId: id, phaseGroupId: id });
export const bracketSettingsSchema = z.object({
  stylingGameId: z.custom<GameId>((value) => typeof value === 'string' && canonicalGameId(value) === value),
  showBackground: z.boolean().default(true),
  showTournamentLogo: z.boolean().default(true),
  logoAssetId: z.string().max(255).optional(),
  heading: z.string().max(100).optional(),
  eventLabel: z.string().max(100).optional(),
  winnersRound: z.number().int().min(1).max(100).optional(),
  losersRound: z.number().int().min(-100).max(-1).optional(),
  scope: bracketScopeSchema.optional(),
  updatedAt: z.string().datetime({ offset: true })
});
export const bracketSlotSchema = z.object({
  entrantId: id.optional(),
  name: z.string().max(200).optional(),
  sponsor: z.string().max(200).optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  score: z.number().int().min(-1).max(10000).optional(),
  prerequisite: z.object({ setId, placement: z.number().int().min(1).max(2) }).optional()
});
export const bracketMatchSchema = z.object({
  id: setId,
  roundNumber: z.number().int().min(-100).max(100),
  round: z.string().max(200),
  state: z.number().int().min(1).max(7),
  winnerId: id.optional(),
  slots: z.tuple([bracketSlotSchema, bracketSlotSchema])
});
export const bracketSnapshotSchema = z.object({
  scope: bracketScopeSchema,
  tournamentName: z.string(),
  eventName: z.string(),
  phaseName: z.string(),
  groupName: z.string(),
  groupCount: z.number().int().min(0).optional(),
  completed: z.boolean(),
  matches: z.array(bracketMatchSchema).max(256),
  advances: z
    .array(
      z.object({
        entrantId: id,
        phaseId: id,
        groupId: id,
        phaseName: z.string(),
        groupName: z.string(),
        groupCount: z.number().int().min(0).nullish()
      })
    )
    .max(256)
    .default([]),
  fetchedAt: z.string().datetime({ offset: true })
});
export const bracketScreenStateSchema = z.object({
  settings: bracketSettingsSchema,
  snapshot: bracketSnapshotSchema.optional(),
  error: z.string().optional()
});
export const bracketScreenMessageSchema = z.object({
  event: z.literal('bracket-screen-state'),
  payload: bracketScreenStateSchema
});
export type BracketScope = z.infer<typeof bracketScopeSchema>;
export type BracketSettings = z.infer<typeof bracketSettingsSchema>;
export type BracketScreenState = z.infer<typeof bracketScreenStateSchema>;
export type BracketMatch = z.infer<typeof bracketMatchSchema>;
export type BracketSlot = z.infer<typeof bracketSlotSchema>;

export function bracketScopeKey(scope?: BracketScope): string {
  return scope ? `${scope.eventId}/${scope.phaseId}/${scope.phaseGroupId}` : '';
}
