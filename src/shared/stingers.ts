import { z } from 'zod';
import { overlayStateSchema } from './overlayState';

export const stingerLimits = {
  videoBytes: 256 * 1024 * 1024,
  durationSeconds: 120,
  cueLifetimeMs: 125_000
} as const;

export const stingerKindSchema = z.enum(['perfect', 'winner']);
export type StingerKind = z.infer<typeof stingerKindSchema>;
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
  photo: { x: 440, y: 180, width: 480, height: 680 },
  character: { x: 920, y: 160, width: 640, height: 700 },
  name: { x: 0, y: 24, width: 1920, height: 88 }
} as const;
