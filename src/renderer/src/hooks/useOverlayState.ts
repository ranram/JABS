import { useCallback } from 'react';
import { api } from '../api';
import { parseOverlayMessage } from './overlayRealtime';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

export function useOverlayState(onReportRevision?: (revision: number) => void) {
  const onMessage = useCallback((value: unknown) => {
    const revision = parseRealtimeJson(value, (parsed) => {
      const message = parsed as { event?: unknown; revision?: unknown } | null;
      if (
        message?.event === 'startgg-result-reported' &&
        typeof message.revision === 'number' &&
        Number.isSafeInteger(message.revision) &&
        message.revision >= 0
      ) return message.revision;
      return undefined;
    });
    if (revision !== undefined) onReportRevision?.(revision);
  }, [onReportRevision]);
  return useRealtimeState({
    load: api.state,
    diagnosticOperation: 'overlay-state',
    parseMessage: parseOverlayMessage,
    onMessage: onReportRevision ? onMessage : undefined,
    loadError: 'Unable to load local state.'
  });
}
