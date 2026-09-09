export type MediaLayerKind = 'character' | 'photo';

export type MediaTransform = {
  x: number;
  y: number;
  scale: number;
  flipped: boolean;
};

export type PlayerMediaPlacement = Record<MediaLayerKind, MediaTransform>;

export const defaultMediaTransform = (): MediaTransform => ({ x: 0, y: 0, scale: 1, flipped: false });

export const defaultPlayerMediaPlacement = (): PlayerMediaPlacement => ({
  character: defaultMediaTransform(),
  photo: defaultMediaTransform()
});

export function clampMediaTransform(transform: MediaTransform): MediaTransform {
  return {
    x: clamp(transform.x, -0.85, 0.85),
    y: clamp(transform.y, -0.85, 0.85),
    scale: clamp(transform.scale, 0.35, 2.5),
    flipped: transform.flipped
  };
}

export function toggleMediaFlip(transform: MediaTransform): MediaTransform {
  return { ...transform, flipped: !transform.flipped };
}

export function mediaMirrorX(defaultMirror: boolean, transform: MediaTransform): boolean {
  return defaultMirror !== transform.flipped;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
