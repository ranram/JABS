import { measureWork } from './performanceMetrics';
import { blobDataUrl } from './blobDataUrl';

type PixelBounds = { x: number; y: number; width: number; height: number };
const canvasPixelLimit = 16_777_216;
const artworkPixelLimit = 64_000_000;

export function countVisiblePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  columns: Uint32Array,
  rows: Uint32Array,
  offsetX = 0,
  offsetY = 0
) {
  for (let y = 0; y < height; y++) {
    let rowCount = 0;
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 2) continue;
      columns[offsetX + x]++;
      rowCount++;
    }
    rows[offsetY + y] += rowCount;
  }
}

function contentEdge(counts: Uint32Array, edge: number, opposite: number, step: 1 | -1) {
  const minimumGap = Math.max(16, Math.ceil(counts.length * 0.03));
  let lastContent = edge;
  let outerPixels = 0;
  let gap = 0;
  for (let index = edge; index !== opposite + step; index += step) {
    const count = counts[index];
    if (!count) {
      gap++;
      continue;
    }
    if (gap >= minimumGap) lastContent = index;
    outerPixels += count;
    // Leave detached effects intact. Only a few pixels beyond a wide gap count as export noise.
    if (outerPixels > 4) break;
    gap = 0;
  }
  return lastContent;
}

export function visiblePixelBounds(columns: Uint32Array, rows: Uint32Array): PixelBounds | undefined {
  let left = columns.findIndex(Boolean);
  if (left === -1) return undefined;
  let right = columns.length - 1;
  while (right > left && !columns[right]) right--;
  let top = rows.findIndex(Boolean);
  let bottom = rows.length - 1;
  while (bottom > top && !rows[bottom]) bottom--;
  if (rows.reduce((sum, count) => sum + count, 0) >= 128) {
    const cleanLeft = contentEdge(columns, left, right, 1);
    right = contentEdge(columns, right, left, -1);
    left = cleanLeft;
    const cleanTop = contentEdge(rows, top, bottom, 1);
    bottom = contentEdge(rows, bottom, top, -1);
    top = cleanTop;
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
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
    if (!width || !height || width * height > artworkPixelLimit) return source;
    // Keep readbacks small. Sample oversized artwork so it can still be cropped.
    const sampleScale = Math.min(1, Math.sqrt(canvasPixelLimit / (width * height)));
    const sampleWidth = Math.max(1, Math.floor(width * sampleScale));
    const sampleHeight = Math.max(1, Math.floor(height * sampleScale));
    const pixelWidth = width / sampleWidth;
    const pixelHeight = height / sampleHeight;
    canvas.width = Math.min(sampleWidth, 1024);
    canvas.height = Math.min(sampleHeight, 256);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return source;
    const finishBounds = measureWork('image-bounds');
    const columns = new Uint32Array(sampleWidth);
    const rows = new Uint32Array(sampleHeight);
    let tiles = 0;
    try {
      for (let y = 0; y < sampleHeight; y += canvas.height) {
        for (let x = 0; x < sampleWidth; x += canvas.width) {
          const w = Math.min(canvas.width, sampleWidth - x);
          const h = Math.min(canvas.height, sampleHeight - y);
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, x * pixelWidth, y * pixelHeight, w * pixelWidth, h * pixelHeight, 0, 0, w, h);
          countVisiblePixels(context.getImageData(0, 0, w, h).data, w, h, columns, rows, x, y);
          if (++tiles % 4 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }
    } finally {
      finishBounds();
    }
    const bounds = visiblePixelBounds(columns, rows);
    if (!bounds) return source;
    // Leave a margin for soft edges and the rounding in oversized images.
    const x = Math.max(0, Math.floor((bounds.x - 1) * pixelWidth));
    const y = Math.max(0, Math.floor((bounds.y - 1) * pixelHeight));
    const croppedWidth = Math.min(width, Math.ceil((bounds.x + bounds.width + 1) * pixelWidth)) - x;
    const croppedHeight = Math.min(height, Math.ceil((bounds.y + bounds.height + 1) * pixelHeight)) - y;
    if (croppedWidth === width && croppedHeight === height) return source;
    const outputScale = Math.min(1, Math.sqrt(canvasPixelLimit / (croppedWidth * croppedHeight)));
    canvas.width = Math.max(1, Math.floor(croppedWidth * outputScale));
    canvas.height = Math.max(1, Math.floor(croppedHeight * outputScale));
    context.drawImage(image, x, y, croppedWidth, croppedHeight, 0, 0, canvas.width, canvas.height);
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
