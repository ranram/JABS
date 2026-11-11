import { describe, expect, it } from 'vitest';
import {
  defaultHeadshotCrop,
  scoreboardPhotoViewBox,
  scoreboardPhotoLayout,
  type ScoreboardPhoto
} from './scoreboardPhotos';
import layouts from './scoreboardPhotoLayouts.json';

const photo: ScoreboardPhoto = {
  source: 'headshot',
  assetId: 'portrait.png',
  fingerprint: '1234567890abcdef',
  crop: defaultHeadshotCrop(),
  autoFrame: true
};

describe('automatic scoreboard photo framing', () => {
  it('fits opaque, padded, small and full-height portraits on both sides of every game', () => {
    for (const gameId of Object.keys(layouts)) {
      const layout = scoreboardPhotoLayout({ gameId: 'street-fighter-6', assetCatalogSlug: gameId })!;
      for (const side of ['left', 'right'] as const) {
        const [, , w, h] = layout.sides[side].bounds;
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
    }
  });
});
