import type { NoticeSink } from './operatorNotice';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { OverlayState, SelectedSetState } from '@shared/models';
import { api } from '../../api';
import {
  normalizeOperatorDraft,
  operatorDraftContentKey,
  reconcileDirtyDraft,
  type OperatorDraftState
} from '../../operatorDraft';

const AUTOSAVE_DEBOUNCE_MS = 120;

type StreamDraftAutosaveOptions = {
  draft?: SelectedSetState;
  dirty: boolean;
  assetCatalogSlug?: string;
  setOverlayState: Dispatch<SetStateAction<OverlayState | undefined>>;
  setDraftState: Dispatch<SetStateAction<OperatorDraftState | undefined>>;
  setMessage: NoticeSink;
  failureMessage: string;
};

export function useStreamDraftAutosave({
  draft,
  dirty,
  assetCatalogSlug,
  setOverlayState,
  setDraftState,
  setMessage,
  failureMessage
}: StreamDraftAutosaveOptions) {
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const failedKeyRef = useRef<string | undefined>(undefined);
  const pausedRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const inFlightRef = useRef<Promise<void> | undefined>(undefined);

  async function withAutosavePaused(action: () => Promise<void>): Promise<void> {
    pausedRef.current = true;
    window.clearTimeout(timerRef.current);
    try {
      await inFlightRef.current;
      await action();
      failedKeyRef.current = undefined;
      setBlocked(false);
    } finally {
      pausedRef.current = false;
    }
  }

  useEffect(() => {
    if (pausedRef.current || !dirty || !draft || saving) return;
    if (!draft.displayName.trim() || !draft.playerOne.name.trim() || !draft.playerTwo.name.trim()) return;
    const submitted = normalizeOperatorDraft(draft, assetCatalogSlug);
    const submittedKey = operatorDraftContentKey(draft, assetCatalogSlug);
    if (failedKeyRef.current === submittedKey) return;
    setBlocked(false);

    async function save() {
      setSaving(true);
      // Re-arm identical moderation errors so each rejected edit produces a fresh toast.
      setMessage(undefined, 'info');
      api.reportRendererDiagnostic('stream-save:renderer-start');
      try {
        const response = await api.updateSelectedSet(submitted);
        const canApplyReply = (current?: SelectedSetState) =>
          !current || current.updatedAt === submitted.updatedAt || current.updatedAt === response.selectedSet.updatedAt;
        // A newer realtime update takes precedence over a delayed HTTP reply.
        setOverlayState((current) => (canApplyReply(current?.selectedSet) ? response : current));
        failedKeyRef.current = undefined;
        setDraftState((current) => {
          if (!current) return current;
          if (!canApplyReply(current.baseline)) return current;
          // The WebSocket echo may arrive first. Compare content without its native timestamp.
          if (operatorDraftContentKey(current.value, assetCatalogSlug) === submittedKey) {
            return { value: response.selectedSet, baseline: response.selectedSet, dirty: false };
          }
          return {
            value: reconcileDirtyDraft(current.value, current.baseline, response.selectedSet),
            baseline: response.selectedSet,
            dirty: true
          };
        });
        api.reportRendererDiagnostic('stream-save:renderer-complete');
      } catch (error) {
        failedKeyRef.current = submittedKey;
        setBlocked(true);
        api.reportRendererDiagnostic('stream-save:renderer-failed');
        setMessage(error instanceof Error ? error.message : failureMessage, 'error');
      } finally {
        setSaving(false);
      }
    }
    timerRef.current = window.setTimeout(() => {
      if (!pausedRef.current) inFlightRef.current = save();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [assetCatalogSlug, dirty, draft, failureMessage, saving, setDraftState, setMessage, setOverlayState]);

  return { saving, blocked, withAutosavePaused };
}
