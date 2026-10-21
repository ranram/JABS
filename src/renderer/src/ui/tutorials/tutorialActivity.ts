import { useSyncExternalStore } from 'react';

let active = false;
const listeners = new Set<() => void>();
export const isTutorialActive = () => active;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function setTutorialActive(value: boolean) {
  if (active === value) return;
  active = value;
  listeners.forEach((listener) => listener());
}

export function useTutorialActive() {
  return useSyncExternalStore(subscribe, isTutorialActive, isTutorialActive);
}
