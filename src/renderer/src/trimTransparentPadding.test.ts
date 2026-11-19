import { expect, it, vi } from 'vitest';
import { countVisiblePixels, trimTransparentPadding, visiblePixelBounds } from './trimTransparentPadding';

function bounds(pixels: Uint8ClampedArray, width: number, height: number) {
  const columns = new Uint32Array(width);
  const rows = new Uint32Array(height);
  countVisiblePixels(pixels, width, height, columns, rows);
  return visiblePixelBounds(columns, rows);
}

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
  expect(bounds(pixels, 8, 6)).toEqual({ x: 2, y: 1, width: 5, height: 4 });
  pixel(0, 0, 255);
  pixel(7, 5, 255);
  expect(bounds(pixels, 8, 6)).toEqual({ x: 0, y: 0, width: 8, height: 6 });
  expect(bounds(new Uint8ClampedArray(8 * 6 * 4), 8, 6)).toBeUndefined();
  expect(bounds(new Uint8ClampedArray(8 * 6 * 4).fill(255), 8, 6)).toEqual({
    x: 0,
    y: 0,
    width: 8,
    height: 6
  });
  expect(bounds(new Uint8ClampedArray([0, 0, 0, 3]), 1, 1)).toEqual({ x: 0, y: 0, width: 1, height: 1 });

  const padded = new Uint8ClampedArray(100 * 40 * 4);
  const mark = (x: number, y: number) => {
    padded[(y * 100 + x) * 4 + 3] = 255;
  };
  for (let x = 20; x < 55; x++) for (let y = 3; y < 37; y++) mark(x, y);
  mark(99, 0);
  mark(99, 39);
  // The nearby accent survives while distant corner pixels do not set the bounds.
  mark(10, 15);
  expect(bounds(padded, 100, 40)).toEqual({ x: 10, y: 0, width: 45, height: 40 });
  for (let y = 25; y < 30; y++) mark(80, y);
  expect(bounds(padded, 100, 40)).toEqual({ x: 10, y: 0, width: 71, height: 40 });
});

it('scans original pixels across tile boundaries with bounded readbacks and keeps the crop padding', async () => {
  const draws: number[][] = [];
  const reads: number[][] = [];
  let tile: number[] = [];
  const context = {
    clearRect() {},
    drawImage(_image: unknown, ...coordinates: number[]) {
      tile = coordinates;
      draws.push(coordinates);
    },
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
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 2050;
      naturalHeight = 2;
      decode = async () => undefined;
    }
  );
  try {
    expect(await trimTransparentPadding('original')).toBe('original');
    expect(reads).toEqual([
      [1024, 2],
      [1024, 2],
      [2, 2]
    ]);
    expect(draws.at(-1)).toEqual([1022, 0, 1028, 2, 0, 0, 1028, 2]);
    expect(canvas.width).toBe(0);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('crops oversized artwork within the canvas pixel budget', async () => {
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect() {},
      drawImage,
      getImageData(_x: number, _y: number, width: number, height: number) {
        const tile = drawImage.mock.lastCall!;
        const data = new Uint8ClampedArray(width * height * 4);
        if (tile[1] > 1000 && tile[1] < 6000 && tile[2] > 1000 && tile[2] < 3000) {
          data[3] = 255;
          data[data.length - 1] = 255;
        }
        return { data };
      }
    }),
    toBlob: (done: (blob: null) => void) => done(null)
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('window', { setTimeout });
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 8192;
      naturalHeight = 4096;
      decode = async () => undefined;
    }
  );
  try {
    await trimTransparentPadding('original');
    const [, x, y, width, height, , , outputWidth, outputHeight] = drawImage.mock.lastCall!;
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(width).toBeLessThan(8192);
    expect(height).toBeLessThan(4096);
    expect(outputWidth * outputHeight).toBeLessThanOrEqual(16_777_216);
  } finally {
    vi.unstubAllGlobals();
  }
});
