import type { PlayerState, SelectedSetState } from '@shared/models';
import { winnerSideForLocalScore, winnerSideForMatch } from '@shared/gameProfiles';
import { normalizeRound } from '@shared/matchContext';

export type AnnouncementPresentation = {
  kind: 'winner' | 'champion';
  winner: PlayerState;
};

export function reportedWinnerConflict(selectedSet: SelectedSetState) {
  const { setId, reportedOutcome, playerOne, playerTwo, useReportedBroadcastWinner } = selectedSet;
  const localSide = winnerSideForLocalScore(selectedSet);
  if (!setId || !localSide || !reportedOutcome) return undefined;
  const localWinner = localSide === 'one' ? playerOne : playerTwo;
  const reportedWinner = localSide === 'one' ? playerTwo : playerOne;
  if (reportedOutcome.winnerId !== reportedWinner.entrantId) return undefined;

  return {
    localWinner,
    reportedWinner,
    reportedKind: reportedOutcome.kind,
    usingReported: useReportedBroadcastWinner === true
  };
}

export function announcementPresentation(
  selectedSet: SelectedSetState,
  { allowLeadingScore = false }: { allowLeadingScore?: boolean } = {}
): AnnouncementPresentation | undefined {
  if (selectedSet.upstreamReset) return undefined;
  const conflict = reportedWinnerConflict(selectedSet);
  const winnerSide = winnerSideForMatch(selectedSet);
  let winner = winnerSide === 'one' ? selectedSet.playerOne : winnerSide === 'two' ? selectedSet.playerTwo : undefined;
  if (conflict) winner = conflict.usingReported ? conflict.reportedWinner : conflict.localWinner;
  if (
    !winner &&
    (allowLeadingScore || (selectedSet.matchFormat !== 'topanga' && selectedSet.state === '3')) &&
    selectedSet.playerOne.score !== selectedSet.playerTwo.score
  ) {
    winner = selectedSet.playerOne.score > selectedSet.playerTwo.score ? selectedSet.playerOne : selectedSet.playerTwo;
  }
  if (!winner) return undefined;

  const round = normalizeRound(selectedSet.round);
  const isReset = round === 'grand final reset' || round === 'grand finals reset';
  const isInitialGrandFinal = round === 'grand final' || round === 'grand finals';
  const kind =
    isReset || (isInitialGrandFinal && selectedSet.winnersSideEntrantId === winner.entrantId) ? 'champion' : 'winner';
  return { kind, winner };
}
