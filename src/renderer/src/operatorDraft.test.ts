import { describe, expect, it } from 'vitest';
import type { SelectedSetState } from '@shared/models';
import { operatorDraftContentKey, reconcileDirtyDraft } from './operatorDraft';

describe('operator draft reconciliation', () => {
  it('preserves metadata edits while adopting newer live scores', () => {
    const baseline = selectedSet();
    const draft = {
      ...baseline,
      round: 'Grand Final',
      playerOne: { ...baseline.playerOne, character: 'Jin' }
    };
    const live = {
      ...baseline,
      gameHistory: [
        { winnerId: 'alpha' },
        { winnerId: 'bravo' },
        { winnerId: 'alpha' }
      ],
      playerOne: { ...baseline.playerOne, score: 2 },
      playerTwo: { ...baseline.playerTwo, score: 1 },
      updatedAt: 'live-score-time'
    };

    expect(reconcileDirtyDraft(draft, baseline, live)).toMatchObject({
      round: 'Grand Final',
      playerOne: { entrantId: 'alpha', character: 'Jin', score: 2 },
      playerTwo: { entrantId: 'bravo', score: 1 },
      gameHistory: live.gameHistory,
      updatedAt: 'live-score-time'
    });
  });

  it('follows entrant identity across a live player swap without undoing it', () => {
    const baseline = selectedSet();
    const draft = {
      ...baseline,
      playerOne: { ...baseline.playerOne, name: 'Edited Alpha', character: 'Jin' }
    };
    const live = {
      ...baseline,
      displayName: 'Bravo vs Alpha',
      playerOne: { ...baseline.playerTwo, score: 2 },
      playerTwo: { ...baseline.playerOne, score: 1 },
      updatedAt: 'live-swap-time'
    };

    expect(reconcileDirtyDraft(draft, baseline, live)).toMatchObject({
      displayName: 'Bravo vs Alpha',
      playerOne: { entrantId: 'bravo', name: 'Bravo', score: 2 },
      playerTwo: { entrantId: 'alpha', name: 'Edited Alpha', character: 'Jin', score: 1 },
      updatedAt: 'live-swap-time'
    });
  });

  it('distinguishes the realtime save echo from a genuine mid-save edit', () => {
    // Regression: the native core broadcasts every accepted save before the
    // HTTP response resolves. When the WebSocket echo wins the race, the
    // dashboard reconciles the dirty draft against that live state, which
    // always carries a freshly bumped updatedAt version. The autosave must
    // still recognize it as the draft it just submitted; otherwise the draft
    // stays dirty forever and the save badge toggles endlessly.
    const baseline = selectedSet();
    const draft = { ...baseline, round: 'Grand Final' };
    const submittedKey = operatorDraftContentKey(draft);
    const acceptedLive = {
      ...baseline,
      round: 'Grand Final',
      displayName: baseline.displayName.trim(),
      updatedAt: 'backend-bumped-version'
    };

    const echoedDraft = reconcileDirtyDraft(draft, baseline, acceptedLive);
    expect(echoedDraft.updatedAt).toBe('backend-bumped-version');
    expect(operatorDraftContentKey(echoedDraft)).toBe(submittedKey);
    const editedDuringSave = { ...draft, station: 'Stream B' };

    expect(operatorDraftContentKey(reconcileDirtyDraft(editedDuringSave, baseline, acceptedLive))).not.toBe(submittedKey);
  });

  it('keeps edited styling without replacing authoritative live game detection', () => {
    const baseline = selectedSet();
    const draft = { ...baseline, stylingGameId: 'guilty-gear-strive' as const, bestOf: 5 };
    const live = {
      ...baseline,
      gameId: 'street-fighter-6' as const,
      station: 'Stream B',
      state: '3',
      updatedAt: 'live-context-time'
    };

    expect(reconcileDirtyDraft(draft, baseline, live)).toMatchObject({
      gameId: 'street-fighter-6',
      stylingGameId: 'guilty-gear-strive',
      bestOf: 5,
      station: 'Stream B',
      state: '3',
      updatedAt: 'live-context-time'
    });
  });
});

function selectedSet(): SelectedSetState {
  return {
    setId: 'set-1',
    displayName: 'Alpha vs Bravo',
    round: 'Winners Final',
    station: 'Stream A',
    state: '2',
    gameId: 'tekken-8',
    stylingGameId: 'tekken-8',
    bestOf: 3,
    playerOne: { entrantId: 'alpha', name: 'Alpha', score: 0 },
    playerTwo: { entrantId: 'bravo', name: 'Bravo', score: 0 },
    updatedAt: 'baseline-time'
  };
}
