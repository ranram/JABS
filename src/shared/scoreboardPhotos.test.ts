import { expect, it } from 'vitest';
import {
  defaultHeadshotCrop,
  scoreboardPhotoViewBox,
  scoreboardPhotoPlacement,
  type ScoreboardPhoto
} from './scoreboardPhotos';

const photo: ScoreboardPhoto = {
  source: 'headshot',
  assetId: 'portrait.png',
  fingerprint: '1234567890abcdef',
  crop: defaultHeadshotCrop(),
  autoFrame: true
};

it('fits opaque, padded, small and full-height portraits in wide and tall masks', () => {
  for (const [w, h] of [
    [320, 180],
    [202, 207],
    [180, 320]
  ]) {
    for (const content of [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.4, y: 0, width: 96 / 512, height: 96 / 512 },
      { x: 0.45, y: 0.6, width: 0.25, height: 0.3 },
      { x: 0.1, y: 0.02, width: 0.8, height: 0.95 }
    ]) {
      const image = { ...photo, width: 512, height: 512, contentBounds: content };
      const box = scoreboardPhotoViewBox(image, w / h);
      const left = ((content.x * 512 - box.x) / box.width) * w;
      const top = ((content.y * 512 - box.y) / box.height) * h;
      const width = ((content.width * 512) / box.width) * w;
      const height = ((content.height * 512) / box.height) * h;
      expect(left).toBeGreaterThanOrEqual(w * 0.04 - 0.001);
      expect(left + width).toBeLessThanOrEqual(w * 0.96 + 0.001);
      expect(top).toBeCloseTo(h * 0.04);
      expect(top + height).toBeLessThanOrEqual(h * 0.96 + 0.001);
      expect(left + width / 2).toBeCloseTo(w / 2);
      expect(width / height).toBeCloseTo(content.width / content.height);
    }
  }
});

it('keeps the head inside the fixed SF6 extension when an older saved offset moves it above the mask', () => {
  const offset = { x: 0.03, y: -0.575, scale: 1, flipped: false };
  const image = {
    ...photo,
    width: 400,
    height: 400,
    focusBounds: { x: 0.25, y: 0.01, width: 0.5, height: 0.48 },
    extendedPlacements: { 'street-fighter-6': { left: offset, right: offset } }
  };
  for (const side of ['left', 'right'] as const) {
    expect(scoreboardPhotoPlacement(image, 'street-fighter-6', side, 'extendAbove')).toEqual({ ...offset, y: 0 });
    expect(scoreboardPhotoPlacement({ ...image, autoFrame: false }, 'street-fighter-6', side, 'extendAbove')).toEqual(
      offset
    );
  }
  expect(image.extendedPlacements['street-fighter-6'].right.y).toBe(-0.575);
});
