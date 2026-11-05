import { z } from 'zod';
import { overlayStateSchema } from './overlayState';

export const stingerLimits = {
  videoBytes: 256 * 1024 * 1024,
  durationSeconds: 120,
  cueLifetimeMs: 125_000
} as const;

export const stingerKindSchema = z.enum(['perfect', 'winner']);
export type StingerKind = z.infer<typeof stingerKindSchema>;
export type StingerPlaybackResult = 'completed' | 'unconfigured' | 'blocked' | 'failed';
const videoSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+\.webm$/), name: z.string() });
export const stingerClipSchema = z.object({
  video: videoSchema.optional(),
  durationSeconds: z.number().min(0.5).max(stingerLimits.durationSeconds).optional()
});
export const stingerSettingsSchema = z.object({
  perfect: stingerClipSchema,
  winner: stingerClipSchema,
  automaticWinner: z.boolean(),
  mediaDelaySeconds: z.number().min(0).max(30),
  videoLayer: z.enum(['background', 'foreground']),
  updatedAt: z.string()
});
export type StingerSettings = z.infer<typeof stingerSettingsSchema>;
export const stingerCueSchema = z.object({
  id: z.string(),
  kind: stingerKindSchema,
  settings: stingerSettingsSchema,
  selectedSet: overlayStateSchema.shape.selectedSet.optional(),
  expiresAt: z.number(),
  claimed: z.boolean()
});
export type StingerCue = z.infer<typeof stingerCueSchema>;
export const stingerStateSchema = z.object({
  settings: stingerSettingsSchema,
  cue: stingerCueSchema.optional(),
  readySources: z.number(),
  connectionId: z.string().optional(),
  playbackError: z.string().optional()
});
export type StingerState = z.infer<typeof stingerStateSchema>;
export const stingerClaimSchema = z.object({ cue: stingerCueSchema.optional() });

export function parseStingerRealtime(value: unknown): StingerState | undefined {
  const parsed = z.object({ event: z.literal('stinger-state'), payload: stingerStateSchema }).safeParse(value);
  return parsed.success ? parsed.data.payload : undefined;
}

// These canvas coordinates are also used by the operator's framing preview.
export const stingerFraming = {
  photo: { x: 100, y: 80, width: 880, height: 960 },
  character: { x: 790, y: -30, width: 1130, height: 1110 },
  name: { x: 96, y: 40, width: 1728, height: 172 }
} as const;

export function winnerStingerFraming(photo: boolean, character: boolean) {
  return {
    photo: photo && !character ? { x: 430, y: 60, width: 1060, height: 990 } : stingerFraming.photo,
    character: character && !photo ? { x: 260, y: -30, width: 1400, height: 1110 } : stingerFraming.character,
    name: stingerFraming.name
  };
}
