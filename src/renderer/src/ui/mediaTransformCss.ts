import type { MediaTransform } from '@shared/mediaPlacement';

export type MediaCoordinateSpace = 'preview' | 'overlay';

export const mediaCanvasSelector = '.thumbnail-canvas, .top8-canvas, .versus-preview-canvas';

// Saved offsets are relative to half the stage width and the full stage height.
// Preview canvases scale the same 1920×1080 stage using container-width units.
export const mediaOffsetWidthRatio = 0.5;
export const mediaOffsetHeightRatio = 1080 / 1920;

export function mediaTransformCss(
  transform: MediaTransform,
  mirrorX: boolean,
  baseScale: number,
  coordinateSpace: MediaCoordinateSpace = 'preview'
): string {
  const width = coordinateSpace === 'preview' ? 100 : 1920;
  const unit = coordinateSpace === 'preview' ? 'cqw' : 'px';
  const x = transform.x * (width * mediaOffsetWidthRatio);
  const y = transform.y * (width * mediaOffsetHeightRatio);
  return `translate3d(${x}${unit}, ${y}${unit}, 0) scale(${transform.scale * baseScale})${mirrorX ? ' scaleX(-1)' : ''}`;
}
