import type { PlayerState, SelectedSetState } from '@shared/models';

export type OperatorDraftState = {
  value: SelectedSetState;
  baseline: SelectedSetState;
  dirty: boolean;
};

export function sameDraftMatch(left: SelectedSetState, right: SelectedSetState): boolean {
  // Exhibitions have no set ID, so game context must distinguish their drafts.
  return (
    left.setId === right.setId &&
    left.eventId === right.eventId &&
    left.videogameId === right.videogameId &&
    left.assetCatalogSlug === right.assetCatalogSlug &&
    left.gameId === right.gameId
  );
}

const playerMetadataKeys = [
  'localPlayerId',
  'playerId',
  'playerPhotoAssetId',
  'name',
  'prefix',
  'sponsor',
  'characters',
  'character',
  'characterAssetId',
  'portraitAssetId',
  'country',
  'state',
  'displayFlag',
  'xHandle',
  'pronouns',
  'seed'
] as const satisfies ReadonlyArray<keyof PlayerState>;

function playerByEntrant(state: SelectedSetState, entrantId: string): PlayerState | undefined {
  return [state.playerOne, state.playerTwo].find((player) => player.entrantId === entrantId);
}

function mergePlayer(livePlayer: PlayerState, draft: SelectedSetState, baseline: SelectedSetState): PlayerState {
  const draftPlayer = playerByEntrant(draft, livePlayer.entrantId);
  const baselinePlayer = playerByEntrant(baseline, livePlayer.entrantId);
  if (!draftPlayer || !baselinePlayer) {
    return livePlayer;
  }

  const merged: PlayerState = { ...livePlayer };
  for (const key of playerMetadataKeys) {
    const draftValue = draftPlayer[key];
    const baselineValue = baselinePlayer[key];
    const changed =
      Array.isArray(draftValue) && Array.isArray(baselineValue)
        ? draftValue.length !== baselineValue.length ||
          draftValue.some((value, index) => value !== baselineValue[index])
        : draftValue !== baselineValue;
    if (changed) {
      Object.assign(merged, { [key]: draftPlayer[key] });
    }
  }
  merged.score = livePlayer.score;
  return merged;
}

function changed<K extends keyof SelectedSetState>(
  key: K,
  draft: SelectedSetState,
  baseline: SelectedSetState,
  live: SelectedSetState
): SelectedSetState[K] {
  return draft[key] !== baseline[key] ? draft[key] : live[key];
}

export function reconcileDirtyDraft(
  draft: SelectedSetState,
  baseline: SelectedSetState,
  live: SelectedSetState
): SelectedSetState {
  return {
    ...live,
    displayName: changed('displayName', draft, baseline, live),
    round: changed('round', draft, baseline, live),
    station: changed('station', draft, baseline, live),
    stylingGameId: changed('stylingGameId', draft, baseline, live),
    customScoreboardId: changed('customScoreboardId', draft, baseline, live),
    customScoreboardRevision: changed('customScoreboardRevision', draft, baseline, live),
    matchFormat: changed('matchFormat', draft, baseline, live),
    bestOf: changed('bestOf', draft, baseline, live),
    broadcast: changed('broadcast', draft, baseline, live),
    playerOne: mergePlayer(live.playerOne, draft, baseline),
    playerTwo: mergePlayer(live.playerTwo, draft, baseline),
    updatedAt: live.updatedAt
  };
}

export function normalizeOperatorDraft(draft: SelectedSetState, assetCatalogSlug?: string): SelectedSetState {
  return {
    ...draft,
    assetCatalogSlug: assetCatalogSlug ?? draft.assetCatalogSlug,
    displayName: draft.displayName.trim()
  };
}

/** Ignore native save timestamps so a realtime echo still matches the submitted content. */
export function operatorDraftContentKey(draft: SelectedSetState, assetCatalogSlug?: string): string {
  const { updatedAt: _version, ...content } = normalizeOperatorDraft(draft, assetCatalogSlug);
  return JSON.stringify(content);
}
