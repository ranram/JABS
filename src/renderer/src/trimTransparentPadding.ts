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
  const canvas = document.createElement('canvas');
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    // Bound the temporary RGBA readback to 64 MiB, even for unexpectedly large assets.
    if (!width || !height || width * height > 16_777_216) return source;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return source;
    context.drawImage(image, 0, 0);
    const bounds = visiblePixelBounds(context.getImageData(0, 0, width, height).data, width, height);
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
    const trimmed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return trimmed ? await blobDataUrl(trimmed) : source;
  } catch {
    // Decoding, canvas limits, or unavailable pixel access must not hide usable assets.
    return source;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
