import { useSyncExternalStore } from 'react';

let pending = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const snapshot = () => pending > 0;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Keep installation disabled until requested settings edits have settled. */
export function beginPendingWrite(): () => void {
  pending += 1;
  notify();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    pending -= 1;
    notify();
  };
}

export function usePendingWrites(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
