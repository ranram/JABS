import { api } from '../api';
import { parseOverlayMessage } from './overlayRealtime';
import { useRealtimeState } from './useRealtimeState';

export function useOverlayState() {
  return useRealtimeState({
    load: api.state,
    diagnosticOperation: 'overlay-state',
    parseMessage: parseOverlayMessage,
    loadError: 'Unable to load local state.'
  });
}
