import type { PlayerState, SelectedSetState } from '@shared/models';
import { winnerSideForMatch } from '@shared/gameProfiles';

export type AnnouncementPresentation = {
  kind: 'winner' | 'champion';
  winner: PlayerState;
};

export function announcementPresentation(
  selectedSet: SelectedSetState
): AnnouncementPresentation | undefined {
  const winnerSide = winnerSideForMatch(selectedSet);
  let winner = winnerSide === 'one' ? selectedSet.playerOne
    : winnerSide === 'two' ? selectedSet.playerTwo : undefined;
  if (!winner && selectedSet.matchFormat !== 'topanga' && selectedSet.state === '3'
    && selectedSet.playerOne.score !== selectedSet.playerTwo.score) {
    winner = selectedSet.playerOne.score > selectedSet.playerTwo.score
      ? selectedSet.playerOne : selectedSet.playerTwo;
  }
  if (!winner) return undefined;

  const round = normalizeRound(selectedSet.round);
  const isReset = round === 'grand final reset' || round === 'grand finals reset';
  const isInitialGrandFinal = round === 'grand final' || round === 'grand finals';
  const kind = isReset || (
    isInitialGrandFinal && selectedSet.winnersSideEntrantId === winner.entrantId
  )
    ? 'champion'
    : 'winner';
  return { kind, winner };
}

function normalizeRound(value: string | undefined): string {
  return value
    ?.normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() ?? '';
}
