import { useEffect, useState } from 'react';
import type { SelectedSetState } from '@shared/models';
import { reconcileDirtyDraft, type OperatorDraftState } from '../../operatorDraft';

export function useOperatorDraft(selectedSet?: SelectedSetState) {
  const [draftState, setDraftState] = useState<OperatorDraftState>();
  useEffect(() => {
    if (!selectedSet) return;
    setDraftState((current) => {
      if (current?.dirty && current.value.setId === selectedSet.setId) {
        return {
          value: reconcileDirtyDraft(current.value, current.baseline, selectedSet),
          baseline: selectedSet,
          dirty: true
        };
      }
      return { value: selectedSet, baseline: selectedSet, dirty: false };
    });
  }, [selectedSet]);
  return [draftState, setDraftState] as const;
}
