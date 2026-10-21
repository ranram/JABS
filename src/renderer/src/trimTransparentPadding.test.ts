import { expect, it } from 'vitest';
import { visiblePixelBounds } from './trimTransparentPadding';

it('removes transparent margins while retaining disconnected artwork and faint edge pixels', () => {
  const pixels = new Uint8ClampedArray(8 * 6 * 4);
  const pixel = (x: number, y: number, alpha: number) => {
    pixels[(y * 8 + x) * 4 + 3] = alpha;
  };
  // Asymmetric padding, a faint edge, and a detached accent must all survive.
  pixel(0, 5, 1);
  pixel(2, 1, 3);
  pixel(5, 4, 255);
  pixel(6, 2, 100);
  expect(visiblePixelBounds(pixels, 8, 6)).toEqual({ x: 2, y: 1, width: 5, height: 4 });
  pixel(0, 0, 255);
  pixel(7, 5, 255);
  expect(visiblePixelBounds(pixels, 8, 6)).toEqual({ x: 0, y: 0, width: 8, height: 6 });
  expect(visiblePixelBounds(new Uint8ClampedArray(8 * 6 * 4), 8, 6)).toBeUndefined();
  expect(visiblePixelBounds(new Uint8ClampedArray(8 * 6 * 4).fill(255), 8, 6)).toEqual({
    x: 0,
    y: 0,
    width: 8,
    height: 6
  });
  expect(visiblePixelBounds(new Uint8ClampedArray([0, 0, 0, 3]), 1, 1)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
});
