import { describe, expect, it } from 'vitest';
import { createTestOverlayState } from './testFixtures';
import { startggReportReadiness } from './startggReporting';

describe('start.gg report readiness', () => {
  it('accepts only a completed, untied local score with start.gg identities', () => {
    const selectedSet = {
      ...createTestOverlayState().selectedSet,
      setId: 'set-1',
      state: '2',
      bestOf: 3,
      gameHistory: undefined,
      playerOne: { entrantId: 'entrant-1', name: 'Alpha', score: 2 },
      playerTwo: { entrantId: 'entrant-2', name: 'Bravo', score: 1 }
    };

    expect(startggReportReadiness(selectedSet)).toEqual({
      ready: true,
      result: {
        setId: 'set-1',
        winnerId: 'entrant-1',
        winnerName: 'Alpha',
        winnerScore: 2,
        loserScore: 1
      }
    });
    expect(startggReportReadiness({
      ...selectedSet,
      playerOne: { ...selectedSet.playerOne, score: 1 }
    })).toMatchObject({ ready: false, reason: expect.stringContaining('Complete the local score') });
    expect(startggReportReadiness({ ...selectedSet, state: '3' })).toMatchObject({
      ready: false,
      reason: expect.stringContaining('already marked complete')
    });
  });

  it('builds ordered start.gg game data only from a complete recorded history', () => {
    const selectedSet = {
      ...createTestOverlayState().selectedSet,
      setId: 'set-1',
      state: '2',
      bestOf: 3,
      gameHistory: [
        {
          winnerId: 'entrant-1',
          selections: [
            { entrantId: 'entrant-1', character: 'Ryu' },
            { entrantId: 'entrant-2', character: 'Ken' }
          ]
        },
        { winnerId: 'entrant-2' },
        { winnerId: 'entrant-1' }
      ],
      playerOne: { entrantId: 'entrant-1', name: 'Alpha', score: 2 },
      playerTwo: { entrantId: 'entrant-2', name: 'Bravo', score: 1 }
    };

    expect(startggReportReadiness(selectedSet)).toMatchObject({
      ready: true,
      result: {
        gameData: [
          {
            gameNum: 1,
            winnerId: 'entrant-1',
            selections: [
              { entrantId: 'entrant-1', character: 'Ryu' },
              { entrantId: 'entrant-2', character: 'Ken' }
            ]
          },
          { gameNum: 2, winnerId: 'entrant-2' },
          { gameNum: 3, winnerId: 'entrant-1' }
        ]
      }
    });
    expect(startggReportReadiness({
      ...selectedSet,
      gameHistory: [{ winnerId: 'entrant-1' }]
    })).toMatchObject({
      ready: false,
      reason: expect.stringContaining('does not match')
    });
  });
});
