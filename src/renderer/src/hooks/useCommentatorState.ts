import { parseCommentatorRealtime } from '@shared/commentators';
import { api } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

const parseMessage = (value: unknown) => parseRealtimeJson(value, parseCommentatorRealtime);

export function useCommentatorState() {
  const { state, error } = useRealtimeState({
    load: api.commentatorState,
    parseMessage,
    loadError: 'Unable to load commentator state.'
  });
  return { state, error };
}
