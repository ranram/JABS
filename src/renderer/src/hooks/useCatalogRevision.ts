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

export function requestGameFolderCheck(): void {
  preparationRevision += 1;
  listeners.forEach((listener) => listener());
}

    // Artwork updates leave game-folder setup alone. Reload assets also rechecks folders.
export function useGamePreparationRevision(): number {
  return useSyncExternalStore(subscribe, preparationSnapshot, preparationSnapshot);
}

export function useCatalogRevision(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
