// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { imageContainsPixel, pickMediaImage } from './imageHitTest';

const images: HTMLImageElement[] = [];
afterEach(() => {
  images.splice(0).forEach((image) => image.remove());
  vi.restoreAllMocks();
});

function imageMask(width: number, height: number) {
  const image = document.createElement('img');
  image.src = 'first.png';
  image.style.objectPosition = 'center bottom';
  document.body.append(image);
  images.push(image);
  vi.spyOn(image, 'naturalWidth', 'get').mockReturnValue(width);
  vi.spyOn(image, 'naturalHeight', 'get').mockReturnValue(height);
  const complete = vi.spyOn(image, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 200));
  let opaqueLeft = false;
  const readback = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const canvas = this;
    return {
      drawImage() {},
      getImageData() {
        readback();
        expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(512);
        const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            data[(y * canvas.width + x) * 4 + 3] = x < canvas.width / 2 === opaqueLeft ? 255 : 0;
          }
        }
        return { data };
      }
    } as unknown as CanvasRenderingContext2D;
  });
  return {
    image,
    readback,
    complete,
    reverseAlpha: () => {
      opaqueLeft = true;
    }
  };
}

it.each([
  { shape: 'wide', width: 400, height: 100, fit: 'contain', y: 275, left: 150, right: 250, padding: true },
  { shape: 'tall', width: 100, height: 400, fit: 'contain', y: 150, left: 185, right: 215, padding: true },
  { shape: 'cropped', width: 400, height: 100, fit: 'cover', y: 150, left: 150, right: 250, padding: false },
  { shape: 'extremely wide', width: 8192, height: 32, fit: 'contain', y: 299.5, left: 150, right: 250, padding: true }
])(
  'selects visible pixels in $shape artwork through mirroring and replacement',
  ({ width, height, fit, y, left, right, padding }) => {
    const { image, readback, reverseAlpha } = imageMask(width, height);
    image.style.objectFit = fit;
    expect(imageContainsPixel(image, left, y)).toBe(false);
    expect(imageContainsPixel(image, right, y)).toBe(true);
    if (padding) expect(imageContainsPixel(image, 150, 110)).toBe(false);
    image.style.transform = 'translate3d(0px, 0px, 0) scale(1.5) scaleX(-1)';
    vi.mocked(image.getBoundingClientRect).mockReturnValue(new DOMRect(50, 50, 300, 300));
    const scaled = (position: number) => 50 + (position - 100) * 1.5;
    expect(imageContainsPixel(image, scaled(left), scaled(y))).toBe(true);
    expect(imageContainsPixel(image, scaled(right), scaled(y))).toBe(false);
    expect(readback).toHaveBeenCalledOnce();
    reverseAlpha();
    image.src = 'replacement.png';
    expect(imageContainsPixel(image, scaled(left), scaled(y))).toBe(false);
    expect(imageContainsPixel(image, scaled(right), scaled(y))).toBe(true);
    expect(readback).toHaveBeenCalledTimes(2);
  }
);

it('ignores transparent space in a lone image, even with Alt, and excludes hidden or failed images', () => {
  const { image, complete } = imageMask(2, 2);
  image.style.objectFit = 'contain';
  expect(pickMediaImage([image], 150, 150, false)).toBeUndefined();
  expect(pickMediaImage([image], 150, 150, true)).toBeUndefined();
  expect(pickMediaImage([image], 250, 150, true)).toBe(image);
  image.style.visibility = 'hidden';
  expect(pickMediaImage([image], 250, 150, true)).toBeUndefined();
  image.style.visibility = 'visible';
  complete.mockReturnValue(false);
  expect(pickMediaImage([image], 250, 150, true)).toBeUndefined();
});
