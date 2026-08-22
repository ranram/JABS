import { useEffect, useState } from 'react';
import { websocketUrl } from '../api';
import { reconnectDelay } from './realtime';

type RealtimeStateOptions<T> = {
  load(): Promise<T>;
  parseMessage(value: unknown): T | undefined;
  loadError: string;
  reconnectingError?: string;
};

/** Keeps a local state snapshot synchronized with the shared realtime stream. */
export function useRealtimeState<T>({
  load,
  parseMessage,
  loadError,
  reconnectingError = 'Realtime connection interrupted. Reconnecting…'
}: RealtimeStateOptions<T>) {
  const [state, setState] = useState<T>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;

    async function refresh(): Promise<void> {
      try {
        const next = await load();
        if (!disposed) {
          setState(next);
          setError(undefined);
        }
      } catch (requestError) {
        if (!disposed) setError(requestError instanceof Error ? requestError.message : loadError);
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
          reconnectAttempt = 0;
          setError(undefined);
          void refresh();
        });
        nextSocket.addEventListener('message', (event) => {
          if (disposed || socket !== nextSocket) return;
          const next = parseMessage(event.data);
          if (next !== undefined) {
            setState(next);
            setError(undefined);
          }
        });
        nextSocket.addEventListener('close', () => {
          if (disposed || socket !== nextSocket) return;
          socket = undefined;
          setError(reconnectingError);
          scheduleReconnect();
        });
        nextSocket.addEventListener('error', () => {
          if (!disposed && socket === nextSocket) setError(reconnectingError);
        });
      } catch (socketError) {
        if (disposed) return;
        setError(socketError instanceof Error ? socketError.message : reconnectingError);
        scheduleReconnect();
      }
    }

    void refresh();
    void connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [load, loadError, parseMessage, reconnectingError]);

  return { state, setState, error };
}
