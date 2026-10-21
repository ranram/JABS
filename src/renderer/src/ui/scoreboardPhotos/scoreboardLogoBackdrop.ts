const logoSampleSize = 256;
const visibleAlphaThreshold = 8;
const maximumFillAspectRatio = 4 / 3;

export type ScoreboardLogoContent = { aspectRatio: number; x: number; y: number; width: number; height: number };

/** Measure visible artwork without retaining a full-size pixel buffer. Bounds are fractions of the source image. */
export function readLogoContent(image: HTMLImageElement): ScoreboardLogoContent {
  const fullImage = { aspectRatio: image.naturalWidth / image.naturalHeight, x: 0, y: 0, width: 1, height: 1 };
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, logoSampleSize / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fullImage;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] <= visibleAlphaThreshold) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return fullImage;
    const width = (right - left + 1) / canvas.width;
    const height = (bottom - top + 1) / canvas.height;
    return {
      aspectRatio: (fullImage.aspectRatio * width) / height,
      x: left / canvas.width,
      y: top / canvas.height,
      width,
      height
    };
  } catch {
    return fullImage;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export function scoreboardLogoPlacement(
  bounds: readonly number[],
  side: 'left' | 'right',
  content?: ScoreboardLogoContent
) {
  const [x, y, width, height] = bounds;
  const radians = Math.atan2(height, width);
  const angle = (radians * 180) / Math.PI;
  let logoWidth = Math.hypot(width, height) * 0.9;
  let logoHeight = Math.min(width, height) * 0.84;
  let logoX = x + (width - logoWidth) / 2;
  let logoY = y + (height - logoHeight) / 2;
  let transform: string | undefined = `rotate(${side === 'left' ? angle : -angle} ${x + width / 2} ${y + height / 2})`;
  if (content && content.aspectRatio <= maximumFillAspectRatio) {
    // Fill the panel upright, excluding transparent margins from the fit.
    const visibleWidth = Math.max(width, height * content.aspectRatio);
    const visibleHeight = visibleWidth / content.aspectRatio;
    logoWidth = visibleWidth / content.width;
    logoHeight = visibleHeight / content.height;
    logoX = x + (width - visibleWidth) / 2 - content.x * logoWidth;
    logoY = y + (height - visibleHeight) / 2 - content.y * logoHeight;
    transform = undefined;
  }
  return {
    x: logoX,
    y: logoY,
    width: logoWidth,
    height: logoHeight,
    opacity: 0.14,
    transform
  };
}
