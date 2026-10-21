import { describe, expect, it } from 'vitest';
import type { SelectedSetState } from '@shared/models';
import { announcementPresentation } from './announcementPresentation';

function completedSet(round: string, winner: 'one' | 'two', winnersSideEntrantId?: string): SelectedSetState {
  return {
    displayName: 'Alpha vs Beta', round, winnersSideEntrantId, gameId: 'street-fighter-6', bestOf: 5,
    playerOne: { entrantId: 'alpha', name: 'Alpha', score: winner === 'one' ? 3 : 1 },
    playerTwo: { entrantId: 'beta', name: 'Beta', score: winner === 'two' ? 3 : 1 },
    updatedAt: '2026-08-12T00:00:00.000Z'
  };
}

describe('announcement presentation', () => {
  it('distinguishes ordinary winners, bracket resets, and champions', () => {
    expect(announcementPresentation(completedSet('Winners Final', 'one'))?.kind).toBe('winner');
    expect(announcementPresentation(completedSet('Grand Final', 'one', 'alpha'))?.kind).toBe('champion');
    expect(announcementPresentation(completedSet('Grand Finals', 'two', 'alpha'))?.kind).toBe('winner');
    expect(announcementPresentation(completedSet('Grand Final Reset', 'two', 'alpha'))?.kind).toBe('champion');
  });

  it('waits for Topanga deuce to finish and awards the deciding win at 9–9', () => {
    const selected = { ...completedSet('Exhibition', 'one'), matchFormat: 'topanga' as const, bestOf: 13 };
    for (const [winningScore, losingScore, finished] of [
      [6, 0, false], [6, 6, false], [7, 0, true], [7, 5, true], [7, 6, false],
      [7, 7, false], [8, 6, true], [8, 7, false], [9, 7, true],
      [9, 8, false], [9, 9, false], [10, 8, true], [10, 9, true], [10, 10, false]
    ] as const) {
      for (const side of ['one', 'two'] as const) {
        const result = announcementPresentation({
          ...selected,
          // A stale completion marker must not announce a winner during deuce.
          state: '3',
          playerOne: { ...selected.playerOne, score: side === 'one' ? winningScore : losingScore },
          playerTwo: { ...selected.playerTwo, score: side === 'two' ? winningScore : losingScore }
        });
        if (finished) expect(result).toMatchObject({
          kind: 'winner', winner: { entrantId: side === 'one' ? 'alpha' : 'beta' }
        });
        else expect(result, `${side}: ${winningScore}–${losingScore}`).toBeUndefined();
      }
    }
  });
});
