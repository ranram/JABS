import { describe, expect, it } from 'vitest';
import { createTestOverlayState } from '../../../shared/testFixtures';
import { parseOverlayMessage } from './overlayRealtime';

describe('overlay realtime helpers', () => {
  it('accepts overlay-state messages and ignores malformed or unrelated messages', () => {
    const state = createTestOverlayState('tekken-8');

    expect(
      parseOverlayMessage(
        JSON.stringify({
          event: 'overlay-state',
          payload: state
        })
      )
    ).toEqual(state);
    expect(parseOverlayMessage('{not-json')).toBeUndefined();
    expect(parseOverlayMessage(JSON.stringify({ event: 'other', payload: state }))).toBeUndefined();
    expect(parseOverlayMessage(new Uint8Array())).toBeUndefined();
    const message = (payload: unknown) => JSON.stringify({ event: 'overlay-state', payload });
    for (const target of [2, 3, 5, 7, 10]) {
      const exhibition = {
        selectedSet: {
          ...state.selectedSet,
          matchFormat: 'first-to',
          bestOf: target * 2 - 1,
          gameHistory: undefined,
          playerOne: { ...state.selectedSet.playerOne, score: target }
        }
      };
      expect(parseOverlayMessage(message(exhibition))).toMatchObject({
        selectedSet: { matchFormat: 'first-to', bestOf: target * 2 - 1, playerOne: { score: target } }
      });
      for (const side of ['playerOne', 'playerTwo'] as const) {
        expect(parseOverlayMessage(message({
          selectedSet: {
            ...exhibition.selectedSet,
            [side]: { ...exhibition.selectedSet[side], score: target + 1 }
          }
        }))).toBeUndefined();
      }
    }

    const topanga = {
      ...state.selectedSet, matchFormat: 'topanga', bestOf: 13, gameHistory: undefined,
      playerOne: { ...state.selectedSet.playerOne, score: 10 },
      playerTwo: { ...state.selectedSet.playerTwo, score: 9 }
    };
    expect(parseOverlayMessage(message({ selectedSet: topanga }))).toMatchObject({ selectedSet: {
      matchFormat: 'topanga', bestOf: 13, playerOne: { score: 10 }, playerTwo: { score: 9 }
    } });
    for (const patch of [
      { bestOf: 19 }, { setId: '123' }, { eventId: '456' }, { tournamentSlug: 'tournament' },
      { playerOne: { ...topanga.playerOne, score: 11 } },
      { playerTwo: { ...topanga.playerTwo, score: 11 } }
    ]) expect(parseOverlayMessage(message({ selectedSet: { ...topanga, ...patch } }))).toBeUndefined();

    expect(parseOverlayMessage(message({
      ...state, selectedSet: { ...state.selectedSet, gameId: 'unknown-game' }
    }))).toBeUndefined();
    expect(
      parseOverlayMessage(
        message({
          ...state,
          selectedSet: { ...state.selectedSet, playerTwo: undefined }
        })
      )
    ).toBeUndefined();
    expect(
      parseOverlayMessage(
        message({
          ...state,
          selectedSet: {
            ...state.selectedSet,
            playerOne: { ...state.selectedSet.playerOne, score: -1 }
          }
        })
      )
    ).toBeUndefined();
    expect(
      parseOverlayMessage(
        message({
          ...state,
          selectedSet: { ...state.selectedSet, updatedAt: 'not-a-timestamp' }
        })
      )
    ).toBeUndefined();
  });

});
