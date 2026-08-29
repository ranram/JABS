import type { GameId } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';

export function automaticScoreboardSelection(stylingGameId: GameId): Partial<SelectedSetState> {
  return { stylingGameId, customScoreboardId: undefined, customScoreboardRevision: undefined };
}

export function customScoreboardSelection(
  customScoreboardId?: string,
  customScoreboardRevision?: string
): Partial<SelectedSetState> {
  return { customScoreboardId, customScoreboardRevision };
}
