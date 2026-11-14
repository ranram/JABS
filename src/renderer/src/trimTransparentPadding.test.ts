import { expect, it, vi } from 'vitest';
import { trimTransparentPadding, visiblePixelBounds } from './trimTransparentPadding';

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

it('scans original pixels across tile boundaries with bounded readbacks and keeps the crop padding', async () => {
  const draws: number[][] = [];
  const reads: number[][] = [];
  let tile: number[] = [];
  const context = {
    clearRect() {},
    drawImage(_image: unknown, ...coordinates: number[]) { tile = coordinates; draws.push(coordinates); },
    getImageData(_x: number, _y: number, width: number, height: number) {
      reads.push([width, height]);
      const data = new Uint8ClampedArray(width * height * 4);
      for (const x of [1023, 1024, 2049]) {
        const local = x - tile[0];
        if (local >= 0 && local < width) data[local * 4 + 3] = 3;
      }
      return { data };
    }
  };
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (done: (blob: null) => void) => done(null) };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('Image', class { naturalWidth = 2050; naturalHeight = 2; decode = async () => undefined; });
  try {
    expect(await trimTransparentPadding('original')).toBe('original');
    expect(reads).toEqual([[1024, 2], [1024, 2], [2, 2]]);
    expect(draws.at(-1)).toEqual([1022, 0, 1028, 2, 0, 0, 1028, 2]);
    expect(canvas.width).toBe(0);
  } finally { vi.unstubAllGlobals(); }
});
