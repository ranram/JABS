import { describe, expect, it } from 'vitest';
import { createTestOverlayState } from './testFixtures';
import { startggReportReadiness } from './startggReporting';
import { winnerSideForMatch } from './gameProfiles';

describe('start.gg report readiness', () => {
  it('reports explicit W/L and DQ winners without making up games or replacing saved progress', () => {
    const selected = createTestOverlayState().selectedSet;
    selected.setId = '100';
    selected.state = '1';
    selected.gameHistory = [];
    selected.playerOne.score = 0;
    selected.playerTwo.score = 0;
    selected.upstreamReset = true;
    const before = structuredClone(selected);
    for (const kind of ['win-loss', 'disqualification'] as const) {
      const outcome = { kind, winnerId: selected.playerTwo.entrantId };
      const readiness = startggReportReadiness(selected, outcome);
      expect(readiness).toMatchObject({ ready: true, result: { outcome, winnerId: outcome.winnerId } });
      if (readiness.ready) expect(readiness.result.gameData).toBeUndefined();
      expect(startggReportReadiness({ ...selected, state: '3' }, outcome)).toMatchObject({ ready: false });
      expect(startggReportReadiness({ ...selected, setId: undefined }, outcome)).toMatchObject({ ready: false });
      expect(startggReportReadiness(selected, { kind, winnerId: 'foreign-player' })).toMatchObject({ ready: false });
      expect(winnerSideForMatch({ ...selected, upstreamReset: false, reportedOutcome: outcome })).toBe('two');
    }
    expect(selected).toEqual(before);
    expect(startggReportReadiness(selected)).toMatchObject({ ready: false });
  });
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
    const reset = { ...selectedSet, upstreamReset: true };
    expect(startggReportReadiness(reset)).toMatchObject({ ready: false, reasonCode: 'upstream-reset' });
    expect(winnerSideForMatch(reset)).toBeUndefined();
    expect(startggReportReadiness({ ...reset, upstreamReset: false })).toMatchObject({ ready: true });
    expect(winnerSideForMatch({ ...reset, upstreamReset: false })).toBe('one');
    expect(startggReportReadiness({
      ...selectedSet,
      matchFormat: 'first-to',
      bestOf: 19,
      playerOne: { ...selectedSet.playerOne, score: 10 }
    })).toMatchObject({
      ready: false,
      reasonCode: 'exhibition-local-only'
    });
    expect(startggReportReadiness({
      ...selectedSet,
      matchFormat: 'topanga',
      bestOf: 13,
      playerOne: { ...selectedSet.playerOne, score: 10 },
      playerTwo: { ...selectedSet.playerTwo, score: 9 }
    })).toMatchObject({ ready: false, reasonCode: 'exhibition-local-only' });
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
