import { z } from 'zod';

export const streamDeckActions = [
  'score-p1-up',
  'score-p1-down',
  'score-p2-up',
  'score-p2-down',
  'swap-players',
  'reset-scores',
  'swap-commentators',
  'open-players',
  'open-queue',
  'open-selector',
  'queue-next',
  'queue-previous',
  'queue-toggle',
  'clear-queue',
  'clear-players',
  'confirm',
  'cancel'
] as const;
export const streamDeckCommandSchema = z
  .object({
    id: z.string().min(1).max(80),
    action: z.enum(streamDeckActions),
    expiresAt: z.number(),
    expectedVersion: z.string().optional(),
    queueRevision: z.number().optional(),
    confirmationId: z.string().optional()
  })
  .strict();
export type StreamDeckCommand = z.infer<typeof streamDeckCommandSchema>;
export type StreamDeckResult = 'completed' | 'blocked' | 'confirmation-required' | 'failed';
export const streamDeckSnapshotSchema = z.object({
  type: z.literal('state'),
  protocol: z.literal(1),
  version: z.string(),
  confirmationId: z.string().min(1).max(80).nullable().default(null),
  playerOne: z.object({ name: z.string(), score: z.number() }),
  playerTwo: z.object({ name: z.string(), score: z.number() }),
  queue: z.object({
    revision: z.number(),
    status: z.string(),
    running: z.boolean(),
    count: z.number(),
    cursor: z.number().nullable()
  })
});
export type StreamDeckSnapshot = z.infer<typeof streamDeckSnapshotSchema>;

export function streamDeckTiles(state: StreamDeckSnapshot) {
  return [
    { id: 'player-1-name', label: 'Player 1 Name', value: state.playerOne.name },
    { id: 'score-p1', label: 'Score p1', value: String(state.playerOne.score) },
    { id: 'score-p2', label: 'Score p2', value: String(state.playerTwo.score) },
    { id: 'player-2-name', label: 'Player 2 Name', value: state.playerTwo.name }
  ];
}
