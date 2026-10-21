import { useRef, type Ref } from 'react';
import { useImageFallback } from '../useImageFallback';
import { mediaTransformCss } from '../mediaTransformCss';
import '../playerPhoto.css';
import { mediaMirrorX, type MediaTransform } from '@shared/mediaPlacement';
import { useMediaAdjustment, type MediaImageControls } from './useMediaAdjustment';

export type { MediaImageControls } from './useMediaAdjustment';

type AdjustableMediaImageProps = {
  controlsRef?: Ref<MediaImageControls>;
  src: string;
  fallbackSrc?: string;
  className: string;
  label: string;
  transform: MediaTransform;
  selected: boolean;
  mirrorX?: boolean;
  baseScale?: number;
  onSelect(): void;
  onChange(transform: MediaTransform): void;
};

export function AdjustableMediaImage({
  controlsRef,
  src,
  fallbackSrc,
  className,
  label,
  transform,
  selected,
  mirrorX = false,
  baseScale = 1,
  onSelect,
  onChange
}: AdjustableMediaImageProps) {
  const image = useImageFallback(src, fallbackSrc);
  const effectiveMirrorX = mediaMirrorX(mirrorX, transform);
  const imageRef = useRef<HTMLImageElement>(null);
  const { dragging, ...controls } = useMediaAdjustment({
    elementRef: imageRef,
    controlsRef,
    transform,
    selected,
    onSelect,
    onChange,
    interactionKey: JSON.stringify([src, label, baseScale, mirrorX]),
    preview(next) {
      if (imageRef.current)
        imageRef.current.style.transform = mediaTransformCss(next, mediaMirrorX(mirrorX, next), baseScale);
    }
  });
  return (
    <img
      ref={imageRef}
      className={`${className} keyboard-adjustable-media is-loaded${image.placeholder ? ' is-placeholder' : ''}${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      src={image.src}
      alt=""
      aria-label={label}
      tabIndex={selected ? 0 : -1}
      draggable={false}
      data-export-mirror-x={effectiveMirrorX || undefined}
      style={{ transform: mediaTransformCss(transform, effectiveMirrorX, baseScale) }}
      {...controls}
      onLoad={image.onLoad}
      onError={image.onError}
    />
  );
}
