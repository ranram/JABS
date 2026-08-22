import { parseVersusScreenRealtime } from '@shared/versusScreen';
import { api } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

const parseMessage = (value: unknown) => parseRealtimeJson(value, parseVersusScreenRealtime);

export function useVersusScreenState() {
  return useRealtimeState({
    load: api.versusScreenState,
    parseMessage,
    loadError: 'Unable to load Versus Screen settings.'
  });
}
