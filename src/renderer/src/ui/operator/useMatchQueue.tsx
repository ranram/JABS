import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { parseQueueRealtime, type QueueContext } from '@shared/matchQueue';
import { matchQueueApi } from '../../matchQueueApi';
import { useRealtimeState } from '../../hooks/useRealtimeState';
import { parseRealtimeJson } from '../../hooks/realtime';
import { usePendingWrites } from '../../pendingWrites';
import { MatchQueueModal } from './MatchQueueModal';
import { localizedNativeError } from '../../i18n/nativeErrors';
import { MatchQueueContext, QueuedSetsContext, type QueueController } from './matchQueueContext';

const heartbeatIntervalMs = 2000;
const heartbeatTimeoutMs = 3000;

const parseMessage = (value: unknown) => parseRealtimeJson(value, parseQueueRealtime);
export function MatchQueueWorkspace({
  context,
  liveSetId,
  blocked,
  children
}: {
  context?: QueueContext;
  liveSetId?: string;
  blocked: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('operator');
  const live = useRealtimeState({
    load: matchQueueApi.current,
    diagnosticOperation: 'queue-read',
    parseMessage,
    loadError: t('queue.loadFailed')
  });
  const queuedSetKey = JSON.stringify([
    live.state?.context?.eventId ?? null,
    live.state?.entries.map((entry) => entry.setId) ?? []
  ]);
  const queuedSets = useMemo(() => {
    const [eventId, ids] = JSON.parse(queuedSetKey) as [string | null, string[]];
    return { eventId, positions: new Map(ids.map((id, index) => [id, index])) };
  }, [queuedSetKey]);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [holding, setHolding] = useState(false);
  const pending = usePendingWrites();
  const clientId = useRef(crypto.randomUUID());
  const operationInFlight = useRef(false);
  const sequence = useRef(0);
  const settledSequence = useRef(0);
  const pendingHeartbeats = useRef(new Set<AbortController>());
  const latest = useRef({ context, blocked, pending, busy, holding, state: live.state });
  latest.current = { context, blocked, pending, busy, holding, state: live.state };
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const heartbeat = useCallback(async () => {
    const current = latest.current;
    const controller = new AbortController();
    const requestSequence = ++sequence.current;
    pendingHeartbeats.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(new DOMException('', 'TimeoutError')), heartbeatTimeoutMs);
    function settleConnection(failed: boolean) {
      // Only newer replies change connection status. A timed-out request can still
      // mark the connection lost while later requests are waiting.
      if (requestSequence <= settledSequence.current) return;
      settledSequence.current = requestSequence;
      setConnectionFailed(failed);
    }
    try {
      await matchQueueApi.heartbeat({
        clientId: clientId.current,
        eventId: current.context?.eventId,
        busy: current.blocked || current.pending || current.busy || current.holding || focusedRef.current,
        sequence: requestSequence,
        preserveStation: current.context?.preserveStation ?? false,
        preserveMatchLength: current.context?.preserveMatchLength ?? false,
        signal: controller.signal
      });
      settleConnection(false);
    } catch {
      settleConnection(true);
    } finally {
      pendingHeartbeats.current.delete(controller);
      window.clearTimeout(timeout);
    }
  }, []);
  useEffect(() => {
    const updateFocus = () => {
      const next = Boolean(document.activeElement?.closest('.editor-panel'));
      if (next === focusedRef.current) return;
      focusedRef.current = next;
      setFocused(next);
      void heartbeat();
    };
    document.addEventListener('focusin', updateFocus);
    document.addEventListener('focusout', updateFocus);
    const wake = () => {
      if (latest.current.state?.running)
        void matchQueueApi
          .action(latest.current.state.revision, { action: 'pause' })
          .then(live.setState)
          .catch(() => undefined);
    };
    window.addEventListener('online', wake);
    const timer = window.setInterval(() => void heartbeat(), heartbeatIntervalMs);
    return () => {
      window.clearInterval(timer);
      settledSequence.current = ++sequence.current;
      for (const controller of pendingHeartbeats.current) controller.abort();
      pendingHeartbeats.current.clear();
      document.removeEventListener('focusin', updateFocus);
      document.removeEventListener('focusout', updateFocus);
      window.removeEventListener('online', wake);
    };
  }, [heartbeat, live.setState]);
  // Focus and queue-field holds send immediately from their handlers.
  useEffect(() => {
    void heartbeat();
  }, [context?.eventId, blocked, pending, busy, heartbeat]);
  useEffect(() => {
    if (live.error && latest.current.state?.running) {
      const state = latest.current.state;
      void matchQueueApi
        .action(state.revision, { action: 'pause' })
        .then(live.setState)
        .catch(() => undefined);
    }
  }, [live.error, live.setState]);

  async function execute(action: () => ReturnType<typeof matchQueueApi.current>): Promise<boolean> {
    if (operationInFlight.current) return false;
    operationInFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      live.setState(await action());
      return true;
    } catch (e) {
      setError(localizedNativeError(e, t('queue.actionFailed')));
      // Reload the authoritative revision after a rejected or uncertain request.
      try {
        live.setState(await matchQueueApi.current());
      } catch {
        // Later realtime updates can restore the queue state if this read also fails.
      }
      return false;
    } finally {
      operationInFlight.current = false;
      setBusy(false);
    }
  }
  const controller: QueueController = {
    state: live.state,
    context,
    liveSetId,
    waitReason:
      live.error || connectionFailed
        ? t('ux.queueConnection')
        : holding
          ? t('ux.queueEditing')
          : focused
            ? t('ux.streamEditing')
            : blocked || pending || busy
              ? t('ux.queueWorking')
              : undefined,
    opened,
    busy,
    blocked: blocked || pending || Boolean(live.error) || connectionFailed,
    error: error ?? live.error,
    open: () => setOpened(true),
    close: () => {
      setOpened(false);
      setHolding(false);
    },
    hold: (holding) => {
      latest.current.holding = holding;
      setHolding(holding);
      void heartbeat();
    },
    add: async (setId) => {
      const state = latest.current.state;
      const context = latest.current.context;
      if (!state || !context) return false;
      return execute(() => matchQueueApi.add(state.revision, context, setId));
    },
    act: async (action) => {
      const state = latest.current.state;
      if (!state) return false;
      return execute(async () => {
        const updated = await matchQueueApi.action(state.revision, action);
        if (action.action === 'settings' && action.mode !== state.mode && updated.entries.length > 0) {
          // Start from the saved revision so a concurrent queue edit still rejects this request.
          return matchQueueApi.action(updated.revision, { action: 'start' });
        }
        return updated;
      });
    }
  };
  return (
    <MatchQueueContext.Provider value={controller}>
      <QueuedSetsContext.Provider value={queuedSets}>{children}</QueuedSetsContext.Provider>
      <MatchQueueModal />
    </MatchQueueContext.Provider>
  );
}
