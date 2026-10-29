import { parseResultScreenRealtime } from '@shared/resultScreen';
import { api } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

const parseMessage = (value: unknown) => parseRealtimeJson(value, parseResultScreenRealtime);

export function useResultScreenState() {
  return useRealtimeState({
    load: api.resultScreenState,
    diagnosticOperation: 'result-screen',
    parseMessage,
    loadError: 'Unable to load Winner/Champion settings.'
  });
}
