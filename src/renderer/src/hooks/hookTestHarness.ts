import { act, createElement, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach } from 'vitest';

const cleanups = new Set<() => Promise<void>>();
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
afterEach(async () => {
  for (const cleanup of cleanups) await cleanup();
});

export async function mountHook<T>(render: () => T, strict = false, view?: (value: T) => ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let current: T;
  let callback = render;
  function Consumer() {
    current = callback();
    return view ? view(current) : null;
  }
  async function rerender(next = callback) {
    callback = next;
    await act(async () => {
      const consumer = createElement(Consumer);
      root.render(strict ? createElement(StrictMode, null, consumer) : consumer);
    });
  }
  async function unmount() {
    if (!cleanups.delete(unmount)) return;
    await act(async () => root.unmount());
    container.remove();
  }
  cleanups.add(unmount);
  await rerender();
  return { get current() { return current; }, container, rerender, unmount };
}

export function mountView(render: () => ReactNode) {
  return mountHook(render, false, (view) => view);
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
