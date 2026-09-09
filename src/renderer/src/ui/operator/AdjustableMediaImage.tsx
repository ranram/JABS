import { useEffect, useRef, useState } from 'react';
import {
  clampMediaTransform,
  mediaMirrorX,
  toggleMediaFlip,
  type MediaTransform
} from '@shared/mediaPlacement';

type AdjustableMediaImageProps = {
  src: string;
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
  src,
  className,
  label,
  transform,
  selected,
  mirrorX = false,
  baseScale = 1,
  onSelect,
  onChange
}: AdjustableMediaImageProps) {
  const effectiveMirrorX = mediaMirrorX(mirrorX, transform);
  const imageRef = useRef<HTMLImageElement>(null);
  const liveTransformRef = useRef(transform);
  const pendingTransformRef = useRef<MediaTransform | undefined>(undefined);
  const publishTimerRef = useRef<number | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    canvasWidth: number;
    transform: MediaTransform;
  } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (selected) imageRef.current?.focus({ preventScroll: true });
  }, [selected]);

  useEffect(() => {
    liveTransformRef.current = transform;
    if (imageRef.current) {
      imageRef.current.style.transform = transformCss(transform, effectiveMirrorX, baseScale);
    }
  }, [baseScale, effectiveMirrorX, transform]);

  useEffect(() => () => {
    if (publishTimerRef.current !== undefined) window.clearTimeout(publishTimerRef.current);
  }, []);

  return (
    <img
      ref={imageRef}
      className={`${className} keyboard-adjustable-media is-loaded${selected ? ' is-selected' : ''}${dragging ? ' is-dragging' : ''}`}
      src={src}
      alt=""
      aria-label={label}
      tabIndex={selected ? 0 : -1}
      draggable={false}
      data-export-mirror-x={effectiveMirrorX || undefined}
      style={{ transform: transformCss(transform, effectiveMirrorX, baseScale) }}
      onFocus={onSelect}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const canvas = event.currentTarget.closest<HTMLElement>('.thumbnail-canvas, .top8-canvas, .versus-preview-canvas');
        onSelect();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          canvasWidth: Math.max(1, canvas?.getBoundingClientRect().width ?? 1),
          transform: liveTransformRef.current
        };
        setDragging(true);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        previewTransform({
          ...drag.transform,
          x: drag.transform.x + (event.clientX - drag.clientX) / (drag.canvasWidth * 0.5),
          y: drag.transform.y + (event.clientY - drag.clientY) / (drag.canvasWidth * 0.5625)
        });
      }}
      onPointerUp={(event) => finishDrag(event.currentTarget, event.pointerId)}
      onPointerCancel={(event) => finishDrag(event.currentTarget, event.pointerId)}
      onKeyDown={(event) => {
        const movement = event.shiftKey ? 0.05 : 0.012;
        const scale = event.shiftKey ? 0.1 : 0.04;
        let next: MediaTransform | undefined;
        const current = liveTransformRef.current;
        if (event.key === 'ArrowLeft') next = { ...current, x: current.x - movement };
        if (event.key === 'ArrowRight') next = { ...current, x: current.x + movement };
        if (event.key === 'ArrowUp') next = { ...current, y: current.y - movement };
        if (event.key === 'ArrowDown') next = { ...current, y: current.y + movement };
        if (event.key === '+' || event.key === '=') next = { ...current, scale: current.scale + scale };
        if (event.key === '-' || event.key === '_') next = { ...current, scale: current.scale - scale };
        if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          next = toggleMediaFlip(current);
        }
        if (!next) return;
        event.preventDefault();
        previewTransform(next);
      }}
      onBlur={flushPendingTransform}
      onLoad={(event) => { event.currentTarget.style.removeProperty('display'); }}
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />
  );

  function finishDrag(image: HTMLImageElement, pointerId: number) {
    if (dragRef.current?.pointerId !== pointerId) return;
    if (image.hasPointerCapture(pointerId)) image.releasePointerCapture(pointerId);
    dragRef.current = undefined;
    flushPendingTransform();
    setDragging(false);
  }

  function previewTransform(next: MediaTransform) {
    const clamped = clampMediaTransform(next);
    liveTransformRef.current = clamped;
    pendingTransformRef.current = clamped;
    if (imageRef.current) {
      imageRef.current.style.transform = transformCss(clamped, mediaMirrorX(mirrorX, clamped), baseScale);
    }
    if (publishTimerRef.current !== undefined) window.clearTimeout(publishTimerRef.current);
    publishTimerRef.current = window.setTimeout(flushPendingTransform, 90);
  }

  function flushPendingTransform() {
    if (publishTimerRef.current !== undefined) {
      window.clearTimeout(publishTimerRef.current);
      publishTimerRef.current = undefined;
    }
    const pending = pendingTransformRef.current;
    if (!pending) return;
    pendingTransformRef.current = undefined;
    onChangeRef.current(pending);
  }
}

function transformCss(transform: MediaTransform, mirrorX: boolean, baseScale: number): string {
  return `translate3d(${transform.x * 50}cqw, ${transform.y * 56.25}cqw, 0) scale(${transform.scale * baseScale})${mirrorX ? ' scaleX(-1)' : ''}`;
}
