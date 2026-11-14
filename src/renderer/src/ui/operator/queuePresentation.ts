import type { MatchQueue } from '@shared/matchQueue';

export function currentQueueIndex(state: MatchQueue, liveSetId?: string): number | null {
  if (state.cursor !== null) return state.cursor;
  const liveIndex = state.entries.findIndex((entry) => entry.setId === liveSetId);
  return liveIndex >= 0 ? liveIndex : null;
}

export function nextQueueIndex(state: MatchQueue, liveSetId?: string): number {
  const current = currentQueueIndex(state, liveSetId) ?? -1;
  return state.entries.findIndex((entry, index) => index > current && !entry.resultStatus);
}
