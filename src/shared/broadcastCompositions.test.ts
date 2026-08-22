import { describe, expect, it } from 'vitest';
import { broadcastSurfaceSpecs, validateBroadcastComposition } from './broadcastCompositions';

describe('broadcast composition contracts', () => {
  it('keeps authored regions in bounds and enforces participant counts', () => {
    for (const spec of Object.values(broadcastSurfaceSpecs)) {
      for (const region of Object.values(spec.regions)) {
        expect(region.x).toBeGreaterThanOrEqual(0);
        expect(region.y).toBeGreaterThanOrEqual(0);
        expect(region.x + region.width).toBeLessThanOrEqual(1);
        expect(region.y + region.height).toBeLessThanOrEqual(1);
      }
    }
    const player = { name: 'Player' };
    expect(validateBroadcastComposition({ surface: 'winner', gameId: 'test', participants: [player] })).toBeUndefined();
    expect(validateBroadcastComposition({ surface: 'versus', gameId: 'test', participants: [player] })).toMatch(/requires 2/);
    expect(validateBroadcastComposition({ surface: 'top-eight', gameId: 'test', participants: Array(8).fill(player) })).toBeUndefined();
  });
});
