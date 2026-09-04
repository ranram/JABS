import { useState, type Dispatch, type SetStateAction } from 'react';
import type { OverlayState, SelectedSetState, StartggSetScope } from '@shared/models';
import type { OperatorDraftState } from '../../operatorDraft';
import { api } from '../../api';
import { restoreModeratedSet } from './moderationRefresh';

type Options = {
  selectedSet?: SelectedSetState;
  assetCatalogSlug?: string;
  setScope?: StartggSetScope;
  quickScoreOpen: boolean;
  refreshQuickScore(): Promise<void>;
  refreshSets(scope: StartggSetScope): Promise<void>;
  setOverlayState: Dispatch<SetStateAction<OverlayState | undefined>>;
  setDraftState: Dispatch<SetStateAction<OperatorDraftState | undefined>>;
};

export function useModerationRefresh(options: Options) {
  const [moderationRevision, setModerationRevision] = useState(0);

  async function refreshAfterModeration(): Promise<void> {
    setModerationRevision((current) => current + 1);
    const tasks: Promise<unknown>[] = [];
    const activeSet = options.selectedSet;
    if (activeSet?.setId) {
      tasks.push(api.inspectStartggSet(activeSet.setId, activeSet.gameId, {
        eventId: activeSet.eventId,
        tournamentSlug: activeSet.tournamentSlug,
        assetCatalogSlug: activeSet.assetCatalogSlug ?? options.assetCatalogSlug
      }).then(async (response) => {
        const restored = restoreModeratedSet(activeSet, response.selectedSet);
        const nextState = await api.updateSelectedSet(restored);
        options.setOverlayState(nextState);
        options.setDraftState((current) => current ? {
          value: restoreModeratedSet(current.value, response.selectedSet),
          baseline: restoreModeratedSet(current.baseline, response.selectedSet),
          dirty: current.dirty
        } : current);
      }));
      if (activeSet.eventId && activeSet.playerOne.playerId && activeSet.playerTwo.playerId) {
        tasks.push(api.refreshVersusHistory());
      }
    }
    if (options.quickScoreOpen) tasks.push(options.refreshQuickScore());
    if (options.setScope) tasks.push(options.refreshSets(options.setScope));
    await Promise.allSettled(tasks);
  }

  return { moderationRevision, refreshAfterModeration };
}
