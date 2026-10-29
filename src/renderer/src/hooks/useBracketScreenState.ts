import { bracketScreenMessageSchema } from '@shared/bracketScreen';
import { api } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

const parseMessage = (value: unknown) =>
  parseRealtimeJson(value, (message) => {
    const parsed = bracketScreenMessageSchema.safeParse(message);
    return parsed.success ? parsed.data.payload : undefined;
  });

export function useBracketScreenState() {
  return useRealtimeState({
    load: api.bracketScreenState,
    diagnosticOperation: 'bracket-screen',
    parseMessage,
    loadError: 'Could not load the bracket screen.'
  });
}
