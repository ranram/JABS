import { describe, expect, it } from 'vitest';
import { createTestOverlayState } from '../../../shared/testFixtures';
import { parseOverlayMessage, reconnectDelay } from './overlayRealtime';
import { parseRealtimeJson } from './realtime';

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
  });

  it('rejects structurally present but invalid overlay state payloads', () => {
    const state = createTestOverlayState('tekken-8');
    const message = (payload: unknown) => JSON.stringify({ event: 'overlay-state', payload });

    expect(
      parseOverlayMessage(
        message({
          ...state,
          selectedSet: { ...state.selectedSet, gameId: 'unknown-game' }
        })
      )
    ).toBeUndefined();
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

  it('backs off reconnect attempts and caps the delay', () => {
    expect(reconnectDelay(0)).toBe(500);
    expect(reconnectDelay(1)).toBe(1_000);
    expect(reconnectDelay(4)).toBe(8_000);
    expect(reconnectDelay(10)).toBe(10_000);
    expect(reconnectDelay(-1)).toBe(500);
  });

  it('shares safe JSON decoding across realtime consumers', () => {
    const parseValue = (value: unknown) => typeof value === 'object' ? value : undefined;
    expect(parseRealtimeJson('{"ready":true}', parseValue)).toEqual({ ready: true });
    expect(parseRealtimeJson('{broken', parseValue)).toBeUndefined();
    expect(parseRealtimeJson(new Uint8Array(), parseValue)).toBeUndefined();
  });
});
