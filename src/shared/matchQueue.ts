import { z } from 'zod';

export const queueContextSchema = z.object({
  eventId: z.string().min(1),
  eventName: z.string().min(1),
  tournamentSlug: z.string().min(1),
  gameId: z.string(),
  assetCatalogSlug: z.string().optional(),
  preserveStation: z.boolean().default(false),
  preserveMatchLength: z.boolean().default(false)
});
export const queueEntrySchema = z.object({
  setId: z.string().min(1),
  playerOne: z.string(),
  playerTwo: z.string(),
  entrantOneId: z.string(),
  entrantTwoId: z.string(),
  round: z.string().optional(),
  phase: z.string().optional(),
  resultStatus: z.enum(['completed', 'reported']).optional()
});
export const queueModeSchema = z.enum(['manual', 'report', 'winner-delay']);
export const matchQueueSchema = z.object({
  context: queueContextSchema.optional(),
  entries: z.array(queueEntrySchema).max(100),
  cursor: z.number().int().nonnegative().nullable(),
  mode: queueModeSchema,
  delayMinutes: z.number().int().min(1).max(30),
  running: z.boolean(),
  remainingMs: z.number().nonnegative().nullable(),
  revision: z.number().int().nonnegative(),
  status: z.enum([
    'empty',
    'paused',
    'waiting-winner',
    'waiting-report',
    'countdown',
    'waiting-edits',
    'waiting-players',
    'loading',
    'finished'
  ]),
  error: z.string().optional()
});
export type QueueContext = z.infer<typeof queueContextSchema>;
export type QueueEntry = z.infer<typeof queueEntrySchema>;
export type QueueMode = z.infer<typeof queueModeSchema>;
export type MatchQueue = z.infer<typeof matchQueueSchema>;
export type QueueAction =
  | { action: 'pause' | 'resume' | 'start' | 'previous' | 'next' | 'clear' }
  | { action: 'remove' | 'jump'; setId: string }
  | { action: 'reorder'; order: string[] }
  | { action: 'settings'; mode: QueueMode; delayMinutes: number };
export function parseQueueRealtime(value: unknown): MatchQueue | undefined {
  const result = z.object({ event: z.literal('match-queue'), payload: matchQueueSchema }).safeParse(value);
  return result.success ? result.data.payload : undefined;
}
