import type { SelectedSetState } from '@shared/models';
export type StreamSaveStatus = 'saved' | 'pending' | 'saving' | 'blocked';
export function streamSaveStatus(dirty: boolean, saving: boolean, blocked: boolean): StreamSaveStatus {
  if (blocked && dirty) return 'blocked';
  if (saving) return 'saving';
  return dirty ? 'pending' : 'saved';
}
export function hasStreamMatch(set?: SelectedSetState): boolean {
  return Boolean(
    set &&
    (set.setId ||
      set.videogameId ||
      set.gameName ||
      set.playerOne.name !== 'Player 1' ||
      set.playerTwo.name !== 'Player 2' ||
      set.playerOne.score ||
      set.playerTwo.score)
  );
}
