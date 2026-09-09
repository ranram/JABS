import { describe, expect, it } from 'vitest';
import { clampMediaTransform, defaultMediaTransform, defaultPlayerMediaPlacement, mediaMirrorX, toggleMediaFlip } from './mediaPlacement';

describe('media placement', () => {
  it('keeps independent media transforms inside editor bounds', () => {
    const placement = defaultPlayerMediaPlacement();
    placement.character.x = 0.4;
    expect(placement.photo.x).toBe(0);
    expect(clampMediaTransform({ x: 4, y: -4, scale: 8, flipped: true })).toEqual({ x: 0.85, y: -0.85, scale: 2.5, flipped: true });
    expect(clampMediaTransform({ x: -4, y: 4, scale: 0, flipped: false })).toEqual({ x: -0.85, y: 0.85, scale: 0.35, flipped: false });
    const original = defaultMediaTransform();
    const flipped = toggleMediaFlip(original);
    expect(flipped).toEqual({ ...original, flipped: true });
    expect(mediaMirrorX(false, flipped)).toBe(true);
    expect(mediaMirrorX(true, flipped)).toBe(false);
    expect(toggleMediaFlip(flipped)).toEqual(original);
  });
});
