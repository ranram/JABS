import { z } from 'zod';
import { canonicalGameId, type GameId } from './gameProfiles';

const stylingGameIdSchema = z.custom<GameId>(
  (value) => typeof value === 'string' && canonicalGameId(value) === value
);

export const commentatorPresentationSchema = z.enum(['hidden', 'timed', 'persistent']);
export type CommentatorPresentation = z.infer<typeof commentatorPresentationSchema>;

export const commentatorStateSchema = z.object({
  stylingGameId: stylingGameIdSchema,
  tournamentName: z.string().trim().min(1).max(80),
  logoAssetId: z.string().trim().min(1).optional(),
  showTournamentLogo: z.boolean().default(true),
  commentators: z.tuple([
    z.object({ name: z.string().trim().min(1).max(48), handle: z.string().trim().max(64) }),
    z.object({ name: z.string().trim().min(1).max(48), handle: z.string().trim().max(64) })
  ]),
  presentation: commentatorPresentationSchema,
  updatedAt: z.string().datetime({ offset: true })
});

export type CommentatorState = z.infer<typeof commentatorStateSchema>;

export function withCommentatorsSwapped(state: CommentatorState): CommentatorState {
  return { ...state, commentators: [state.commentators[1], state.commentators[0]] };
}

export function parseCommentatorRealtime(value: unknown): CommentatorState | undefined {
  const message = z.object({
    event: z.literal('commentator-state'),
    payload: commentatorStateSchema
  }).safeParse(value);
  return message.success ? message.data.payload : undefined;
}
