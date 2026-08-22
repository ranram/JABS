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
});
