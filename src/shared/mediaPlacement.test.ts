import { describe, expect, it } from 'vitest';
import { clampMediaTransform, defaultPlayerMediaPlacement } from './mediaPlacement';

describe('media placement', () => {
  it('keeps independent media transforms inside editor bounds', () => {
    const placement = defaultPlayerMediaPlacement();
    placement.character.x = 0.4;
    expect(placement.photo.x).toBe(0);
    expect(clampMediaTransform({ x: 4, y: -4, scale: 8 })).toEqual({ x: 0.85, y: -0.85, scale: 2.5 });
    expect(clampMediaTransform({ x: -4, y: 4, scale: 0 })).toEqual({ x: -0.85, y: 0.85, scale: 0.35 });
  });
});
