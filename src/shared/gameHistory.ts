import { playerCharacters } from './characterTeams';
import type { SelectedSetState, SetGameCharacterSelection } from './models';

export function recordedCharacterSelections(
  selectedSet: SelectedSetState
): SetGameCharacterSelection[] {
  return [selectedSet.playerOne, selectedSet.playerTwo].flatMap((player) =>
    playerCharacters(player).map((character) => ({
      entrantId: player.entrantId,
      character
    }))
  );
}

export function updateRecordedGameHistory(
  history: SelectedSetState['gameHistory'],
  winnerId: string,
  previousScore: number,
  nextScore: number,
  otherScore: number,
  selections: readonly SetGameCharacterSelection[] = []
): SelectedSetState['gameHistory'] {
  if (history === undefined) {
    return nextScore === 0 && otherScore === 0 ? [] : undefined;
  }

  const nextHistory = [...history];
  if (nextScore > previousScore) {
    for (let index = previousScore; index < nextScore; index += 1) {
      nextHistory.push({
        winnerId,
        ...(selections.length
          ? { selections: selections.map((selection) => ({ ...selection })) }
          : {})
      });
    }
    return nextHistory;
  }

  for (let removed = nextScore; removed < previousScore; removed += 1) {
    for (let index = nextHistory.length - 1; index >= 0; index -= 1) {
      if (nextHistory[index]?.winnerId === winnerId) {
        nextHistory.splice(index, 1);
        break;
      }
    }
  }
  return nextHistory;
}
