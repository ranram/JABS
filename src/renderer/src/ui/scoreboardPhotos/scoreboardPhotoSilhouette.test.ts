import { expect, it } from 'vitest';
import { estimatePortraitFocus } from './scoreboardPhotoSilhouette';
import { defaultHeadshotCrop, scoreboardPhotoViewBox } from '@shared/scoreboardPhotos';

function sample(width: number, height: number, alpha: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels[(y * width + x) * 4 + 3] = alpha(x, y);
  }
  return pixels;
}
function portrait(x: number, y: number) {
  const head = ((x - 150) / 22) ** 2 + ((y - 38) / 29) ** 2 <= 1;
  const neck = x >= 140 && x < 161 && y >= 60 && y < 90;
  const body = x >= 65 && x < 205 && y >= 85;
  return head || neck || body ? 255 : 0;
}

it('focuses on the off-center head and shoulders instead of fitting a long torso', () => {
  const focus = estimatePortraitFocus(sample(256, 256, portrait), 256, 256)!;
  expect(focus).toBeDefined();
  expect(focus.x + focus.width / 2).toBeCloseTo(150 / 256, 1);
  const photo = {
    source: 'photo' as const,
    assetId: 'player.png',
    fingerprint: '1234567890abcdef',
    autoFrame: true,
    crop: defaultHeadshotCrop(),
    width: 256,
    height: 256
  };
  const whole = scoreboardPhotoViewBox(photo, 2.04);
  const focused = scoreboardPhotoViewBox({ ...photo, focusBounds: focus }, 2.04);
  expect(whole.height / focused.height).toBeGreaterThan(2);
  // Keep the complete known head, including hair, inside the derived viewport.
  expect(focused.y).toBe(9);
  expect(focused.y + focused.height).toBeGreaterThan(67);
  expect(focused.x).toBeLessThan(128);
  expect(focused.x + focused.width).toBeGreaterThan(172);
});

it('keeps head scale similar when the same cutout has more torso below it', () => {
  const short = estimatePortraitFocus(sample(256, 120, portrait), 256, 120)!;
  const tall = estimatePortraitFocus(sample(256, 256, portrait), 256, 256)!;
  expect(short).toBeDefined();
  expect(tall).toBeDefined();
  expect(Math.abs(short.height * 120 - tall.height * 256)).toBeLessThan(16);
});

it('ignores detached specks and faint alpha without moving the estimated head', () => {
  const clean = estimatePortraitFocus(sample(256, 256, portrait), 256, 256);
  const noisy = sample(256, 256, (x, y) => {
    if (x < 4 && y < 4) return 255;
    if (y < 5) return 16;
    return portrait(x, y);
  });
  expect(estimatePortraitFocus(noisy, 256, 256)).toEqual(clean);
});

it('keeps the ordinary fit for opaque photos, rectangles, empty samples and separate people', () => {
  for (const alpha of [
    () => 255,
    () => 0,
    (x: number, y: number) => (x > 20 && x < 100 && y > 10 ? 255 : 0),
    (x: number, y: number) => portrait(x, y) || portrait(x + 120, y)
  ]) {
    expect(estimatePortraitFocus(sample(256, 256, alpha), 256, 256)).toBeUndefined();
  }
  expect(estimatePortraitFocus(new Uint8ClampedArray(0), 256, 256)).toBeUndefined();
  expect(estimatePortraitFocus(new Uint8ClampedArray(512 * 512 * 4), 512, 512)).toBeUndefined();
});
