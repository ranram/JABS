import { useSyncExternalStore } from 'react';

let pending = 0;
let writesInProgress = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const snapshot = () => pending > 0;
const progressSnapshot = () => writesInProgress > 0;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Hold navigation, queue advancement and installation until edits are resolved. */
export function beginPendingWrite(kind: 'write' | 'confirmation' = 'write'): () => void {
  pending += 1;
  if (kind === 'write') writesInProgress += 1;
  notify();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    pending -= 1;
    if (kind === 'write') writesInProgress -= 1;
    notify();
  };
}

export function usePendingWrites(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useWritesInProgress(): boolean {
  return useSyncExternalStore(subscribe, progressSnapshot, progressSnapshot);
}
