import { useCallback, useEffect, useReducer, useRef, type SetStateAction } from 'react';
import { customScoreboardSchema, type CustomScoreboard } from '@shared/customScoreboards';
import { api } from '../../api';
import { beginPendingWrite } from '../../pendingWrites';

type LayoutDraft = {
  value: CustomScoreboard;
  saved: CustomScoreboard;
  busy: boolean;
  failed: boolean;
  finishWrite?: () => void;
};
type SaveStatus = 'saved' | 'saving' | 'incomplete' | 'error';
const autosaveDelayMs = 400;
const savedNoticeDelayMs = 3000;
const layoutContentKey = (value: CustomScoreboard) => JSON.stringify({ ...value, frameRevision: '' });
const hasUnsavedChanges = (entry: LayoutDraft) => layoutContentKey(entry.value) !== layoutContentKey(entry.saved);
const isValidLayout = (entry: LayoutDraft) => customScoreboardSchema.safeParse(entry.value).success;

function layoutSaveStatus(entry: LayoutDraft | undefined): SaveStatus {
  if (!entry || (!hasUnsavedChanges(entry) && !entry.busy)) return 'saved';
  if (entry.failed) return 'error';
  if (!isValidLayout(entry)) return 'incomplete';
  return 'saving';
}

export function useCustomScoreboardDraft({
  onSaved,
  onIdleSaved,
  onError
}: {
  onSaved(saved: CustomScoreboard): void;
  onIdleSaved?(): void;
  onError(error: unknown): void;
}) {
  const [, render] = useReducer((value: number) => value + 1, 0);
  const callbacks = useRef({ onSaved, onIdleSaved, onError });
  callbacks.current = { onSaved, onIdleSaved, onError };
  const model = useRef({
    entries: new Map<string, LayoutDraft>(),
    selected: undefined as string | undefined,
    mounted: false,
    running: undefined as Promise<void> | undefined,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    noticeTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    notice: undefined as { after: number; saved: boolean } | undefined
  });

  const publish = useCallback(() => {
    const current = model.current;
    for (const entry of current.entries.values()) {
      const pending = entry.busy || (hasUnsavedChanges(entry) && !entry.failed && isValidLayout(entry));
      if (pending && !entry.finishWrite) entry.finishWrite = beginPendingWrite();
      if (!pending && entry.finishWrite) {
        entry.finishWrite();
        entry.finishWrite = undefined;
      }
    }
    clearTimeout(current.noticeTimer);
    if (
      current.mounted &&
      current.notice?.saved &&
      [...current.entries.values()].every((entry) => !entry.busy && !hasUnsavedChanges(entry))
    ) {
      current.noticeTimer = setTimeout(
        () => {
          current.notice = undefined;
          callbacks.current.onIdleSaved?.();
        },
        Math.max(0, current.notice.after - Date.now())
      );
    }
    if (current.mounted) render();
  }, []);

  const flush = useCallback(async () => {
    const current = model.current;
    clearTimeout(current.timer);
    if (current.running) return current.running;
    async function drain() {
      let entry: LayoutDraft | undefined;
      while (
        (entry = [...current.entries.values()].find(
          (item) => hasUnsavedChanges(item) && !item.failed && isValidLayout(item)
        ))
      ) {
        const submitted = entry.value;
        entry.busy = true;
        publish();
        try {
          const saved = await api.updateCustomScoreboard({ ...submitted, frameRevision: crypto.randomUUID() });
          entry.saved = saved;
          // An earlier save can finish after more edits or after the user opens another layout.
          entry.value = entry.value === submitted ? saved : { ...entry.value, frameRevision: saved.frameRevision };
          entry.failed = false;
          if (current.notice && current.selected === saved.id) current.notice.saved = true;
          if (current.mounted) callbacks.current.onSaved(saved);
        } catch (error) {
          if (current.notice) current.notice.saved = false;
          entry.failed = entry.value === submitted;
          callbacks.current.onError(error);
        } finally {
          entry.busy = false;
          publish();
        }
      }
    }
    const running = drain();
    current.running = running;
    try {
      await running;
    } finally {
      if (current.running === running) current.running = undefined;
    }
  }, [publish]);

  useEffect(() => {
    model.current.mounted = true;
    return () => {
      model.current.mounted = false;
      model.current.notice = undefined;
      clearTimeout(model.current.noticeTimer);
      void flush();
    };
  }, [flush]);

  const select = useCallback(
    (value: CustomScoreboard | undefined) => {
      const current = model.current;
      if (current.selected !== value?.id) current.notice = undefined;
      void flush();
      current.selected = value?.id;
      if (value) {
        if (!current.entries.has(value.id))
          current.entries.set(value.id, { value, saved: value, busy: false, failed: false });
      }
      publish();
    },
    [flush, publish]
  );

  const setDraft = useCallback(
    (change: SetStateAction<CustomScoreboard | undefined>) => {
      const current = model.current;
      const entry = current.selected ? current.entries.get(current.selected) : undefined;
      if (!entry) return;
      const next = typeof change === 'function' ? change(entry.value) : change;
      if (!next || next.id !== entry.value.id) return;
      if (layoutContentKey(next) === layoutContentKey(entry.value)) return;
      entry.value = next;
      entry.failed = false;
      current.notice = { after: Date.now() + savedNoticeDelayMs, saved: false };
      clearTimeout(current.timer);
      publish();
      if (hasUnsavedChanges(entry) && isValidLayout(entry))
        current.timer = setTimeout(() => void flush(), autosaveDelayMs);
    },
    [flush, publish]
  );

  const retry = useCallback(() => {
    model.current.notice = { after: Date.now() + savedNoticeDelayMs, saved: false };
    for (const entry of model.current.entries.values()) entry.failed = false;
    publish();
    void flush();
  }, [flush, publish]);

  const forget = useCallback(
    (id: string) => {
      model.current.entries.get(id)?.finishWrite?.();
      model.current.entries.delete(id);
      if (model.current.selected === id) {
        model.current.selected = undefined;
        model.current.notice = undefined;
      }
      publish();
    },
    [publish]
  );

  const current = model.current;
  const entry = current.selected ? current.entries.get(current.selected) : undefined;
  return {
    draft: entry?.value,
    status: layoutSaveStatus(entry),
    saving: [...current.entries.values()].some(
      (item) => item.busy || (hasUnsavedChanges(item) && !item.failed && isValidLayout(item))
    ),
    setDraft,
    select,
    retry,
    flush,
    forget
  };
}
