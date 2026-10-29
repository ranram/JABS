import { createContext, useContext, useEffect } from 'react';
import type { MatchQueue, QueueAction, QueueContext } from '@shared/matchQueue';
import { recordDiagnostic } from '../../diagnostics';

export type QueueController = {
  state?: MatchQueue;
  context?: QueueContext;
  liveSetId?: string;
  waitReason?: string;
  opened: boolean;
  busy: boolean;
  blocked: boolean;
  error?: string;
  open(): void;
  close(): void;
  add(setId: string | readonly string[]): Promise<boolean>;
  act(action: QueueAction): Promise<boolean>;
  hold(holding: boolean): void;
};

// Keep context identity independent of workspace refreshes and its modal imports.
export const MatchQueueContext = createContext<QueueController | undefined>(undefined);

// Selector cards need membership and order, not countdown or edit-hold updates.
export const QueuedSetsContext = createContext<
  { eventId: string | null; positions: ReadonlyMap<string, number> } | undefined
>(undefined);

export function useMatchQueue() {
  const queue = useContext(MatchQueueContext);
  const missing = queue === undefined;
  useEffect(() => {
    if (missing) recordDiagnostic('queue-context-missing', { area: 'bracket' });
  }, [missing]);
  return queue;
}

export const useQueuedSets = () => useContext(QueuedSetsContext);
