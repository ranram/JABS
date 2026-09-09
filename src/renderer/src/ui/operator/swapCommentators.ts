import { withCommentatorsSwapped, type CommentatorState } from '@shared/commentators';
import { api } from '../../api';

export function saveSwappedCommentators(state: CommentatorState): Promise<CommentatorState> {
  return api.updateCommentatorState(withCommentatorsSwapped(state));
}

export async function swapSavedCommentators(): Promise<CommentatorState> {
  return saveSwappedCommentators(await api.commentatorState());
}
