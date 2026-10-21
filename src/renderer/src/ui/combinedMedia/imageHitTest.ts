type Mask = { source: string; width: number; height: number; alpha: Uint8Array };
const masks = new WeakMap<HTMLImageElement, Mask | { source: string }>();

/** Cache a small transparency map so dragging does not reread image pixels. */
export function imageContainsPixel(image: HTMLImageElement, clientX: number, clientY: number): boolean {
  if (!imageContainsPoint(image, clientX, clientY)) return false;
  const rect = image.getBoundingClientRect();
  const style = getComputedStyle(image);
  const scale =
    style.objectFit === 'cover'
      ? Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
      : Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const width = style.objectFit === 'fill' ? rect.width : image.naturalWidth * scale;
  const height = style.objectFit === 'fill' ? rect.height : image.naturalHeight * scale;
  const [positionX = '50%', positionY = '50%'] = (style.objectPosition || '50% 50%').split(' ');
  const offset = (position: string, space: number) =>
    position.endsWith('%')
      ? (space * parseFloat(position)) / 100
      : position === 'center'
        ? space / 2
        : position === 'right' || position === 'bottom'
          ? space
          : parseFloat(position) || 0;
  const mirrored = image.style.transform
    ? image.style.transform.includes('scaleX(-1)')
    : Boolean(image.dataset.exportMirrorX);
  const localX = mirrored ? rect.right - clientX : clientX - rect.left;
  const x = (localX - offset(positionX, rect.width - width)) / width;
  const y = (clientY - rect.top - offset(positionY, rect.height - height)) / height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
  const source = image.currentSrc || image.src;
  let mask = masks.get(image);
  if (!mask || mask.source !== source) {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    try {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Pixel access unavailable');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const alpha = new Uint8Array(canvas.width * canvas.height);
      for (let index = 0; index < alpha.length; index++) alpha[index] = pixels[index * 4 + 3];
      mask = { source, width: canvas.width, height: canvas.height, alpha };
    } catch {
      // The image stays editable if a browser blocks readback; Alt still reaches behind it.
      mask = { source };
    } finally {
      canvas.width = canvas.height = 0;
    }
    masks.set(image, mask);
  }
  return !('alpha' in mask) || mask.alpha[Math.floor(y * mask.height) * mask.width + Math.floor(x * mask.width)] > 8;
}

function imageContainsPoint(image: HTMLImageElement, clientX: number, clientY: number): boolean {
  const rect = image.getBoundingClientRect();
  if (
    !rect.width ||
    !rect.height ||
    clientX < rect.left ||
    clientX >= rect.right ||
    clientY < rect.top ||
    clientY >= rect.bottom
  )
    return false;
  const style = getComputedStyle(image);
  if (
    !image.complete ||
    !image.naturalWidth ||
    !image.naturalHeight ||
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse'
  )
    return false;
  return true;
}

/** Check frontmost images first; Alt selects artwork behind the front image. */
export function pickMediaImage(
  images: HTMLImageElement[],
  x: number,
  y: number,
  behind: boolean
): HTMLImageElement | undefined {
  return pickVisualLayer(
    images,
    (image) => imageContainsPixel(image, x, y),
    (image) => imageContainsPoint(image, x, y),
    behind
  );
}

export function pickVisualLayer<T>(
  layers: T[],
  containsPixel: (layer: T) => boolean,
  containsPoint: (layer: T) => boolean,
  behind: boolean,
  current?: T
): T | undefined {
  const visible = layers.filter(containsPixel);
  if (!behind) return visible[0];
  const bounded = layers.filter(containsPoint);
  if (current !== undefined) {
    const index = bounded.indexOf(current);
    if (index >= 0) return bounded.slice(index + 1).find(containsPixel) ?? bounded[index + 1] ?? visible[0];
  }
  return visible[1] ?? bounded[1] ?? visible[0];
}
