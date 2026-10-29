import { useCallback, useEffect, useState } from 'react';
import { acceptCatalogMessage, websocketUrl } from '../api';
import { reconnectDelay } from './realtime';
import { i18n } from '../i18n';
import { diagnosticArea, recordDiagnostic } from '../diagnostics';
import type { DiagnosticOperation } from '../diagnosticOperations';

type RealtimeStateOptions<T> = {
  load(): Promise<T>;
  parseMessage(value: unknown): T | undefined;
  loadError: string;
  reconnectingError?: string;
  refreshIntervalMs?: number;
  diagnosticOperation?: DiagnosticOperation;
};

/** Keeps a local state snapshot synchronized with the shared realtime stream. */
export function useRealtimeState<T>({
  load,
  parseMessage,
  loadError,
  reconnectingError = i18n.t('errors:realtimeConnection'),
  refreshIntervalMs,
  diagnosticOperation
}: RealtimeStateOptions<T>) {
  const [state, setState] = useState<T>();
  const [error, setError] = useState<string>();
  const [connection, setConnection] = useState(0);
  const reconnect = useCallback(() => setConnection((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    let snapshotVersion = 0;
    let loadId = 0;
    let pendingLoads = 0;
    const diagnosticContext = diagnosticOperation
      ? { area: diagnosticArea(diagnosticOperation), operation: diagnosticOperation } : {};

    async function refresh(): Promise<void> {
      pendingLoads += 1;
      const version = snapshotVersion;
      const requestId = ++loadId;
      try {
        const next = await load();
        if (!disposed && version === snapshotVersion && requestId === loadId) {
          setState(next);
          setError(undefined);
        }
      } catch (requestError) {
        if (!disposed && version === snapshotVersion && requestId === loadId) {
          setError(requestError instanceof Error ? requestError.message : loadError);
        }
      } finally {
        pendingLoads -= 1;
      }
    }

    function scheduleReconnect(): void {
      if (disposed || reconnectTimer !== undefined) return;
      const delay = reconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        void connect();
      }, delay);
    }

    async function connect(): Promise<void> {
      try {
        const url = await websocketUrl();
        if (disposed) return;
        const nextSocket = new WebSocket(url);
        socket = nextSocket;
        nextSocket.addEventListener('open', () => {
          if (disposed || socket !== nextSocket) return;
          if (reconnectAttempt > 0) recordDiagnostic('realtime-reconnected', diagnosticContext);
          reconnectAttempt = 0;
          setError(undefined);
          void refresh();
        });
        nextSocket.addEventListener('message', (event) => {
          if (disposed || socket !== nextSocket) return;
          if (acceptCatalogMessage(event.data)) return;
          const next = parseMessage(event.data);
          if (next !== undefined) {
            snapshotVersion += 1;
            setState(next);
            setError(undefined);
          }
        });
        function disconnected() {
          if (disposed || socket !== nextSocket) return;
          recordDiagnostic('realtime-disconnected', { ...diagnosticContext, reason: 'network' });
          socket = undefined;
          loadId += 1;
          setError(reconnectingError);
          nextSocket.close();
          scheduleReconnect();
        }
        nextSocket.addEventListener('close', disconnected);
        nextSocket.addEventListener('error', disconnected);
      } catch (socketError) {
        if (disposed) return;
        recordDiagnostic('realtime-disconnected', { ...diagnosticContext, reason: 'network' });
        setError(socketError instanceof Error ? socketError.message : reconnectingError);
        scheduleReconnect();
      }
    }

    void refresh();
    void connect();
    const interval = refreshIntervalMs
      ? window.setInterval(() => {
          if (!pendingLoads) void refresh();
        }, refreshIntervalMs)
      : undefined;
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [load, loadError, parseMessage, reconnectingError, refreshIntervalMs, diagnosticOperation, connection]);

  return { state, setState, error, reconnect };
}
