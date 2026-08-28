import type { SelectedSetState, SetGameCharacterSelection } from './models';
import { scoreLimitForBestOf } from './gameProfiles';

export type ReportableStartggResult = {
  setId: string;
  winnerId: string;
  winnerName: string;
  winnerScore: number;
  loserScore: number;
  gameData?: StartggReportedGame[];
};

export type StartggReportedGame = {
  gameNum: number;
  winnerId: string;
  selections?: SetGameCharacterSelection[];
};

export type StartggReportReadiness =
  | { ready: true; result: ReportableStartggResult }
  | {
      ready: false;
      reason: string;
      reasonCode: 'already-complete' | 'set-missing' | 'entrants-missing' | 'score-incomplete' | 'history-mismatch';
      bestOf?: number;
      target?: number;
    };

export function startggReportReadiness(selectedSet: SelectedSetState): StartggReportReadiness {
  if (selectedSet.state === '3') {
    return { ready: false, reason: 'This set is already marked complete on start.gg.', reasonCode: 'already-complete' };
  }
  if (!selectedSet.setId) {
    return { ready: false, reason: 'Load a start.gg set before reporting a result.', reasonCode: 'set-missing' };
  }
  if (!selectedSet.playerOne.entrantId || !selectedSet.playerTwo.entrantId) {
    return { ready: false, reason: 'Both start.gg entrant IDs are required to report a result.', reasonCode: 'entrants-missing' };
  }

  const target = scoreLimitForBestOf(selectedSet.gameId, selectedSet.bestOf);
  const oneWon = selectedSet.playerOne.score === target && selectedSet.playerTwo.score < target;
  const twoWon = selectedSet.playerTwo.score === target && selectedSet.playerOne.score < target;
  if (!oneWon && !twoWon) {
    return {
      ready: false,
      reason: `Complete the local score first. This best-of-${selectedSet.bestOf} ends at ${target} wins.`,
      reasonCode: 'score-incomplete',
      bestOf: selectedSet.bestOf,
      target
    };
  }

  const winner = oneWon ? selectedSet.playerOne : selectedSet.playerTwo;
  const loser = oneWon ? selectedSet.playerTwo : selectedSet.playerOne;
  let gameData: StartggReportedGame[] | undefined;
  if (selectedSet.gameHistory !== undefined) {
    const playerOneWins = selectedSet.gameHistory.filter(
      (game) => game.winnerId === selectedSet.playerOne.entrantId
    ).length;
    const playerTwoWins = selectedSet.gameHistory.filter(
      (game) => game.winnerId === selectedSet.playerTwo.entrantId
    ).length;
    const hasUnknownWinner = selectedSet.gameHistory.some(
      (game) =>
        game.winnerId !== selectedSet.playerOne.entrantId &&
        game.winnerId !== selectedSet.playerTwo.entrantId
    );
    if (
      hasUnknownWinner ||
      playerOneWins !== selectedSet.playerOne.score ||
      playerTwoWins !== selectedSet.playerTwo.score
    ) {
      return {
        ready: false,
        reason: 'Recorded game history does not match the live score. Correct or reset the score before reporting.',
        reasonCode: 'history-mismatch'
      };
    }
    gameData = selectedSet.gameHistory.map((game, index) => ({
      gameNum: index + 1,
      winnerId: game.winnerId,
      ...(game.selections?.length
        ? { selections: game.selections.map((selection) => ({ ...selection })) }
        : {})
    }));
  }
  return {
    ready: true,
    result: {
      setId: selectedSet.setId,
      winnerId: winner.entrantId,
      winnerName: winner.name,
      winnerScore: winner.score,
      loserScore: loser.score,
      gameData
    }
  };
}
