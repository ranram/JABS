import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { parseStingerRealtime } from '@shared/stingers';
import { api } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

const parseMessage = (value: unknown) => parseRealtimeJson(value, parseStingerRealtime);
export function useStingers() {
  const { t } = useTranslation('operator');
  const live = useRealtimeState({
    load: api.stingers,
    diagnosticOperation: 'stingers',
    parseMessage,
    loadError: t('stingers.loadFailed'),
    refreshIntervalMs: 2000
  });
  const previousConnection = useRef<string | undefined>(undefined);
  useEffect(() => {
    const id = live.state?.connectionId;
    if (previousConnection.current && id && previousConnection.current !== id) live.reconnect();
    previousConnection.current = id;
  }, [live.state?.connectionId, live.reconnect]);
  const reconnectSources = useCallback(async () => {
    live.reconnect();
    const snapshot = await api.reconnectStingers();
    live.setState(snapshot);
    return snapshot;
  }, [live.reconnect, live.setState]);
  return { ...live, reconnectSources };
}
