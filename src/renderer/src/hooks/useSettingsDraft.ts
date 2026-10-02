import { useCallback, useEffect, useRef, useState } from 'react';
import { beginPendingWrite } from '../pendingWrites';

type Change<T> = Partial<T> | ((current: T) => T);
type Pending<T> = { change: Change<T>; resolve(saved: boolean): void };

/** Serializes whole-state writes and reapplies queued edits to acknowledged state. */
export function useSettingsDraft<T>({ load, save, onError }: {
  load(): Promise<T>;
  save(state: T): Promise<T>;
  onError(error: unknown): void;
}) {
  const [state, setState] = useState<T>();
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>();
  const callbacks = useRef({ load, save, onError });
  callbacks.current = { load, save, onError };
  const model = useRef({
    acknowledged: undefined as T | undefined,
    submitted: undefined as T | undefined,
    pending: [] as Pending<T>[],
    busy: false,
    mounted: false,
    finishWrite: undefined as (() => void) | undefined,
    loadId: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined
  });

  const publish = useCallback(() => {
    const current = model.current;
    const pending = current.busy || current.pending.length > 0;
    if (pending && !current.finishWrite) current.finishWrite = beginPendingWrite();
    if (!pending && current.finishWrite) {
      current.finishWrite();
      current.finishWrite = undefined;
    }
    if (!current.mounted) return;
    const base = current.submitted ?? current.acknowledged;
    setState(base === undefined ? undefined : apply(base, current.pending));
    setSaving(pending);
  }, []);

  const flush = useCallback(async function flushPending(): Promise<void> {
    const current = model.current;
    if (current.busy || !current.pending.length || current.acknowledged === undefined) return;
    clearTimeout(current.timer);
    const batch = current.pending.splice(0);
    const submitted = apply(current.acknowledged, batch);
    current.submitted = submitted;
    current.busy = true;
    current.loadId += 1;
    try {
      current.acknowledged = await callbacks.current.save(submitted);
      batch.forEach(({ resolve }) => resolve(true));
    } catch (error) {
      // A failed response may follow a committed write, or another writer's edit.
      try {
        current.acknowledged = await callbacks.current.load();
      } catch {
        current.pending.splice(0).forEach(({ resolve }) => resolve(false));
      }
      if (current.mounted) callbacks.current.onError(error);
      batch.forEach(({ resolve }) => resolve(false));
    } finally {
      current.busy = false;
      current.submitted = undefined;
      publish();
      if (current.pending.length) void flushPending();
    }
  }, [publish]);

  const reload = useCallback(async () => {
    const current = model.current;
    if (current.busy || current.pending.length) return;
    const id = ++current.loadId;
    setLoadError(undefined);
    try {
      const loaded = await callbacks.current.load();
      if (!current.mounted || id !== current.loadId) return;
      current.acknowledged = loaded;
      publish();
    } catch (error) {
      if (!current.mounted || id !== current.loadId) return;
      setLoadError(error);
      callbacks.current.onError(error);
    }
  }, [publish]);

  useEffect(() => {
    const current = model.current;
    current.mounted = true;
    void reload();
    return () => {
      current.mounted = false;
      current.loadId += 1;
      clearTimeout(current.timer);
      // Switching panels must not discard an already committed input edit.
      void flush();
    };
  }, [flush, reload]);

  const update = useCallback((change: Change<T>, delay = 0): Promise<boolean> => {
    const current = model.current;
    if (current.acknowledged === undefined) return Promise.resolve(false);
    const result = new Promise<boolean>((resolve) => current.pending.push({ change, resolve }));
    publish();
    clearTimeout(current.timer);
    if (delay) current.timer = setTimeout(() => void flush(), delay);
    else void flush();
    return result;
  }, [flush, publish]);

  return { state, saving, loadError, update, reload };
}

function apply<T>(state: T, pending: Pending<T>[]): T {
  return pending.reduce((current, { change }) => typeof change === 'function'
    ? (change as (state: T) => T)(current)
    : { ...current, ...change }, state);
}
