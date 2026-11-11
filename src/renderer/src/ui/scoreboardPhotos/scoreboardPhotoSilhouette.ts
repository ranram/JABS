import type { PhotoBounds } from '@shared/scoreboardPhotos';

const alphaThreshold = 32;
const maximumSamplePixels = 256 * 256;

/** Estimate a head-and-shoulders crop from alpha. Ambiguous shapes keep the whole-photo fit. */
export function estimatePortraitFocus(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): PhotoBounds | undefined {
  const size = width * height;
  if (width < 8 || height < 8 || size > maximumSamplePixels || pixels.length !== size * 4) return;
  const labels = new Int32Array(size);
  const queue = new Int32Array(size);
  let largest = { label: 0, count: 0 };
  let secondCount = 0;
  let label = 0;
  // Ignore disconnected specks and captions when locating the main cutout.
  for (let i = 0; i < size; i++) {
    if (labels[i] || pixels[i * 4 + 3] <= alphaThreshold) continue;
    label++;
    let end = 1;
    queue[0] = i;
    labels[i] = label;
    for (let start = 0; start < end; start++) {
      const point = queue[start];
      const x = point % width;
      const y = Math.floor(point / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
          const next = point + dy * width + dx;
          if (labels[next] || pixels[next * 4 + 3] <= alphaThreshold) continue;
          labels[next] = label;
          queue[end++] = next;
        }
      }
    }
    if (end > largest.count) {
      secondCount = largest.count;
      largest = { label, count: end };
    } else secondCount = Math.max(secondCount, end);
  }
  if (largest.count < 64 || largest.count > size * 0.98 || secondCount > largest.count * 0.35) return;
  const left = new Int32Array(height).fill(width);
  const right = new Int32Array(height).fill(-1);
  let top = height;
  let bottom = 0;
  for (let i = 0; i < size; i++) {
    if (labels[i] !== largest.label) continue;
    const y = Math.floor(i / width);
    left[y] = Math.min(left[y], i % width);
    right[y] = Math.max(right[y], i % width);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + 1);
  }
  const visibleHeight = bottom - top;
  if (visibleHeight < 16) return;
  // The upper fifth usually contains the broad part of the head, before the shoulders.
  const headRows = Array.from(
    { length: Math.max(1, Math.floor(visibleHeight * 0.14)) },
    (_, i) => top + Math.floor(visibleHeight * 0.08) + i
  );
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const headWidth = median(headRows.map((y) => right[y] - left[y] + 1));
  const center = median(headRows.map((y) => (left[y] + right[y] + 1) / 2));
  if (headWidth < 8) return;
  const stableRows = Math.max(3, Math.round(visibleHeight * 0.02));
  let shoulders: number | undefined;
  // Require a sustained widening below a plausible head, not a single protruding pixel.
  for (let y = top + Math.ceil(headWidth * 0.9); y < Math.min(bottom - stableRows, top + headWidth * 2.5); y++) {
    const widened = Array.from({ length: stableRows }, (_, i) => right[y + i] - left[y + i] + 1);
    if (widened.every((w) => w >= headWidth * 1.35)) {
      shoulders = y;
      break;
    }
  }
  if (shoulders === undefined) return;
  const focusHeight = Math.min(visibleHeight, shoulders - top + headWidth * 0.3);
  // A close headshot already fills the photo. Avoid minor, unnecessary reframing.
  if (focusHeight > visibleHeight * 0.9) return;
  const x = Math.max(0, center - headWidth * 0.9);
  const end = Math.min(width, center + headWidth * 0.9);
  return { x: x / width, y: top / height, width: (end - x) / width, height: focusHeight / height };
}
