import { withCommentatorsSwapped, type CommentatorState } from '@shared/commentators';
import { api } from '../../api';

export const COMMENTATORS_SWAPPED_EVENT = 'jabs:commentators-swapped';

export function saveSwappedCommentators(state: CommentatorState): Promise<CommentatorState> {
  return api.updateCommentatorState(withCommentatorsSwapped(state));
}

export async function swapSavedCommentators(): Promise<CommentatorState> {
  const next = await saveSwappedCommentators(await api.commentatorState());
  window.dispatchEvent(new Event(COMMENTATORS_SWAPPED_EVENT));
  return next;
}
