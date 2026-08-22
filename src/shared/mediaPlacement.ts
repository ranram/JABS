export type MediaLayerKind = 'character' | 'photo';

export type MediaTransform = {
  x: number;
  y: number;
  scale: number;
};

export type PlayerMediaPlacement = Record<MediaLayerKind, MediaTransform>;

export const defaultMediaTransform = (): MediaTransform => ({ x: 0, y: 0, scale: 1 });

export const defaultPlayerMediaPlacement = (): PlayerMediaPlacement => ({
  character: defaultMediaTransform(),
  photo: defaultMediaTransform()
});

export function clampMediaTransform(transform: MediaTransform): MediaTransform {
  return {
    x: clamp(transform.x, -0.85, 0.85),
    y: clamp(transform.y, -0.85, 0.85),
    scale: clamp(transform.scale, 0.35, 2.5)
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
