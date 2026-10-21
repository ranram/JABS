import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import {
  clampMediaTransform,
  sameMediaTransform,
  type MediaLayerKind,
  type MediaTransform,
  type PlayerMediaPlacement
} from '@shared/mediaPlacement';
import { AdjustableMediaImage, type MediaImageControls } from '../operator/AdjustableMediaImage';
import { mediaCanvasSelector, mediaOffsetHeightRatio, mediaOffsetWidthRatio } from '../mediaTransformCss';
import { pickMediaImage } from './imageHitTest';
import { dragGeometry, dragGeometryChanged, useDragInterruption, type DragGeometry } from '../useDragInterruption';
import '../playerMediaLayers.css';
import './combinedMedia.css';

type Props = {
  name: string;
  characterUrl?: string;
  photoUrl?: string;
  characterClass: string;
  photoClass: string;
  photoFallback?: string;
  placement: PlayerMediaPlacement;
  selected?: MediaLayerKind;
  onSelect(layer: MediaLayerKind): void;
  onChange(layer: MediaLayerKind, transform: MediaTransform): void;
};

/** Keep dragging the chosen image until release, even when the pointer crosses the other image. */
export function CombinedMediaEditor({
  name,
  characterUrl,
  photoUrl,
  characterClass,
  photoClass,
  photoFallback,
  placement,
  selected,
  onSelect,
  onChange
}: Props) {
  const drag = useRef<
    | {
        pointer: number;
        layer: MediaLayerKind;
        x: number;
        y: number;
        width: number;
        geometry: DragGeometry;
        start: MediaTransform;
      }
    | undefined
  >(undefined);
  const pendingPreview = useRef<{ layer: MediaLayerKind; transform: MediaTransform } | undefined>(undefined);
  const imageControls = { character: useRef<MediaImageControls>(null), photo: useRef<MediaImageControls>(null) };
  const animationFrame = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const lastSubmittedTransform = useRef<MediaTransform | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [dragging, setDragging] = useState(false);
  useLayoutEffect(() => {
    const current = drag.current;
    if (!current || sameMediaTransform(placement[current.layer], lastSubmittedTransform.current ?? current.start))
      return;
    if (animationFrame.current !== undefined) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = undefined;
    pendingPreview.current = undefined;
    drag.current = undefined;
    if (root.current?.hasPointerCapture(current.pointer)) root.current.releasePointerCapture(current.pointer);
    setDragging(false);
  }, [placement]);
  useEffect(() => {
    const element = root.current;
    return () => {
      if (animationFrame.current !== undefined) cancelAnimationFrame(animationFrame.current);
      pendingPreview.current = undefined;
      const pointer = drag.current?.pointer;
      drag.current = undefined;
      if (pointer !== undefined && element?.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
    };
  }, []);

  function previewPendingFrame() {
    if (animationFrame.current !== undefined) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = undefined;
    const next = pendingPreview.current;
    pendingPreview.current = undefined;
    if (next) imageControls[next.layer].current?.preview(next.transform);
  }

  function finishDrag() {
    const current = drag.current;
    drag.current = undefined;
    previewPendingFrame();
    if (current) imageControls[current.layer].current?.flush();
    setDragging(false);
    if (current && root.current?.hasPointerCapture(current.pointer))
      root.current.releasePointerCapture(current.pointer);
  }
  useDragInterruption(finishDrag);
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer === event.pointerId) finishDrag();
  }

  return (
    <div
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) finishDrag();
      }}
      className={`player-media-layers is-combined combined-media-editor${characterUrl ? ' has-character' : ''}${dragging ? ' is-dragging' : ''}`}
      onPointerDownCapture={(event) => {
        if (event.button !== 0 || event.currentTarget.closest('fieldset[disabled]')) return;
        event.stopPropagation();
        event.preventDefault();
        if (drag.current) return;
        const images = [
          ...event.currentTarget.querySelectorAll<HTMLImageElement>('img.keyboard-adjustable-media')
        ].reverse();
        const image = pickMediaImage(images, event.clientX, event.clientY, event.altKey);
        if (!image) return;
        const layer = image.parentElement?.dataset.layer;
        if (layer !== 'character' && layer !== 'photo') return;
        const canvas = event.currentTarget.closest(mediaCanvasSelector);
        drag.current = {
          pointer: event.pointerId,
          layer,
          x: event.clientX,
          y: event.clientY,
          width: Math.max(1, canvas?.getBoundingClientRect().width ?? 1),
          geometry: dragGeometry(event.currentTarget),
          start: imageControls[layer].current?.flush() ?? placement[layer]
        };
        lastSubmittedTransform.current = drag.current.start;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSelect(layer);
        image.focus({ preventScroll: true });
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointer !== event.pointerId) return;
        if (dragGeometryChanged(event.currentTarget, current.geometry)) {
          finishDrag();
          return;
        }
        pendingPreview.current = {
          layer: current.layer,
          transform: clampMediaTransform({
            ...current.start,
            x: current.start.x + (event.clientX - current.x) / (current.width * mediaOffsetWidthRatio),
            y: current.start.y + (event.clientY - current.y) / (current.width * mediaOffsetHeightRatio)
          })
        };
        if (animationFrame.current === undefined) animationFrame.current = requestAnimationFrame(previewPendingFrame);
      }}
      onPointerUp={finish}
      onKeyDownCapture={(event) => {
        if (drag.current && /^(Arrow(Left|Right|Up|Down)|[+=\-_fF])$/.test(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    >
      {(['character', 'photo'] as const).map((layer) => {
        const src = layer === 'character' ? characterUrl : photoUrl;
        return (
          src && (
            <div key={layer} className="combined-media-layer" data-layer={layer}>
              <AdjustableMediaImage
                src={src}
                fallbackSrc={layer === 'photo' ? photoFallback : undefined}
                controlsRef={imageControls[layer]}
                className={
                  layer === 'character'
                    ? `${characterClass} player-media-character`
                    : `${photoClass} player-media-photo`
                }
                label={`${name} ${layer === 'character' ? 'character artwork' : 'player photo'}`}
                transform={placement[layer]}
                selected={selected === layer}
                onSelect={() => {
                  if (!drag.current || drag.current.layer === layer) onSelect(layer);
                }}
                onChange={(next) => {
                  lastSubmittedTransform.current = next;
                  onChangeRef.current(layer, next);
                }}
              />
            </div>
          )
        );
      })}
    </div>
  );
}
