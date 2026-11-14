import { measureWork } from './performanceMetrics';
import { blobDataUrl } from './blobDataUrl';

type PixelBounds = { x: number; y: number; width: number; height: number };

/** Ignore near-invisible export noise (alpha 1–2 out of 255) when locating artwork. */
export function visiblePixelBounds(pixels: Uint8ClampedArray, width: number, height: number): PixelBounds | undefined {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 2) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? undefined : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Prepare a display copy only. Fully transparent, unpadded, or unsupported images pass through. */
export async function trimTransparentPadding(source: string): Promise<string> {
  const finishTrim = measureWork('image-trim');
  const canvas = document.createElement('canvas');
  try {
    const image = new Image();
    image.src = source;
    const finishDecode = measureWork('image-decode');
    try {
      await image.decode();
    } finally {
      finishDecode();
    }
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > 16_777_216) return source;
    // Scan original pixels in 1 MiB tiles. Small detached accents and faint edges
    // survive, without allocating a full-image RGBA readback or blocking one long scan.
    canvas.width = Math.min(width, 1024);
    canvas.height = Math.min(height, 256);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return source;
    const finishBounds = measureWork('image-bounds');
    let left = width,
      top = height,
      right = -1,
      bottom = -1,
      tiles = 0;
    try {
      for (let y = 0; y < height; y += canvas.height) {
        for (let x = 0; x < width; x += canvas.width) {
          const w = Math.min(canvas.width, width - x);
          const h = Math.min(canvas.height, height - y);
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, x, y, w, h, 0, 0, w, h);
          const tile = visiblePixelBounds(context.getImageData(0, 0, w, h).data, w, h);
          if (tile) {
            left = Math.min(left, x + tile.x);
            top = Math.min(top, y + tile.y);
            right = Math.max(right, x + tile.x + tile.width - 1);
            bottom = Math.max(bottom, y + tile.y + tile.height - 1);
          }
          if (++tiles % 4 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
    } finally {
      finishBounds();
    }
    const bounds = right < left ? undefined : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
    if (!bounds || (bounds.width === width && bounds.height === height)) return source;
    // Retain a pixel around the bounds for soft edges; do not threshold the artwork itself.
    const x = Math.max(0, bounds.x - 1);
    const y = Math.max(0, bounds.y - 1);
    const croppedWidth = Math.min(width, bounds.x + bounds.width + 1) - x;
    const croppedHeight = Math.min(height, bounds.y + bounds.height + 1) - y;
    if (croppedWidth === width && croppedHeight === height) return source;
    canvas.width = croppedWidth;
    canvas.height = croppedHeight;
    context.drawImage(image, x, y, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
    const finishEncode = measureWork('image-encode');
    try {
      const trimmed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      return trimmed ? await blobDataUrl(trimmed) : source;
    } finally {
      finishEncode();
    }
  } catch {
    // Decoding, canvas limits, or unavailable pixel access must not hide usable assets.
    return source;
  } finally {
    finishTrim();
    canvas.width = 0;
    canvas.height = 0;
  }
}
