import { useCallback } from 'react';
import type { SelectedSetState } from '@shared/models';
import { statsContext, statsContextKey, type PlayerStats, type StatsPlayer } from '@shared/playerStats';
import { api } from '../../api';
import { useRealtimeState } from '../../hooks/useRealtimeState';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';

const noStatsMessage = (): PlayerStats | undefined => undefined;

export function usePlayerStats(selectedSet: SelectedSetState | undefined, slot: StatsPlayer, reportRevision: number) {
  const revision = useCatalogRevision();
  const key = selectedSet ? statsContextKey(statsContext(selectedSet, slot)) : undefined;
  const completedSetId = selectedSet?.state === '3' ? selectedSet.setId : undefined;
  const load = useCallback(
    async () => (key ? api.playerStats(slot) : undefined),
    [key, slot, revision, completedSetId, reportRevision]
  );
  const result = useRealtimeState<PlayerStats | undefined>({
    load,
    parseMessage: noStatsMessage,
    loadError: 'Unable to load player stats.',
    realtime: false
  });
  // An old request must never label the next player with someone else's results.
  const state = result.state && statsContextKey(result.state.context) === key ? result.state : undefined;
  return { state, error: result.error };
}
