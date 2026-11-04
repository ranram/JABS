import { useEffect, useRef } from 'react';
import { isTauriRuntime } from '../desktopRuntime';
import { listenForStreamDeck } from './streamDeck';
import { createStreamDeckExecutor, type StreamDeckContext } from './streamDeckCommands';
import { invokeNative } from '../nativeCommand';

export function useStreamDeck(context: StreamDeckContext) {
  const latest = useRef(context);
  latest.current = context;
  const confirmationId = context.confirmation.confirmationId;
  useEffect(() => {
    if (!isTauriRuntime() || !confirmationId) return;
    // Notify native clients when Yes/No, keyboard dismissal, or unmount closes this dialog.
    return () => {
      void invokeNative<void>('stream_deck_confirmation_closed', { id: confirmationId }).catch(() => undefined);
    };
  }, [confirmationId]);
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const execute = createStreamDeckExecutor(() => latest.current);
    void listenForStreamDeck(execute)
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
