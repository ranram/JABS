import { useSyncExternalStore } from 'react';

let revision = 0;
let preparationRevision = 0;
const listeners = new Set<() => void>();
const snapshot = () => revision;
const preparationSnapshot = () => preparationRevision;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function invalidateCatalogConsumers(recheckGameFolders = true): void {
  revision += 1;
  if (recheckGameFolders) preparationRevision += 1;
  listeners.forEach((listener) => listener());
}

// Folder setup refreshes previews when it finishes. That update must not
// request another setup pass; returning to the app or reloading assets should.
export function useGamePreparationRevision(): number {
  return useSyncExternalStore(subscribe, preparationSnapshot, preparationSnapshot);
}

export function useCatalogRevision(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
