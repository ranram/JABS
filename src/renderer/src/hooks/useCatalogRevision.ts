import { useSyncExternalStore } from 'react';

let revision = 0;
const listeners = new Set<() => void>();
const snapshot = () => revision;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function invalidateCatalogConsumers(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function useCatalogRevision(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
