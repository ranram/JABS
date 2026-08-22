import type { SelectedSetState } from './models';

export function updateRecordedGameHistory(
  history: SelectedSetState['gameHistory'],
  winnerId: string,
  previousScore: number,
  nextScore: number,
  otherScore: number
): SelectedSetState['gameHistory'] {
  if (history === undefined) {
    return nextScore === 0 && otherScore === 0 ? [] : undefined;
  }

  const nextHistory = [...history];
  if (nextScore > previousScore) {
    for (let index = previousScore; index < nextScore; index += 1) {
      nextHistory.push({ winnerId });
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
