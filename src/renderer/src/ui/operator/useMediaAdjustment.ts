import {
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type RefObject,
  type KeyboardEvent,
  type PointerEvent
} from 'react';
import { clampMediaTransform, toggleMediaFlip, sameMediaTransform, type MediaTransform } from '@shared/mediaPlacement';
import { mediaCanvasSelector, mediaOffsetHeightRatio, mediaOffsetWidthRatio } from '../mediaTransformCss';
import { dragGeometry, dragGeometryChanged, useDragInterruption, type DragGeometry } from '../useDragInterruption';

export type MediaImageControls = { flush(): MediaTransform; preview(transform: MediaTransform): void };
type MediaElement = HTMLElement | SVGElement;
type Options<T extends MediaElement> = {
  elementRef: RefObject<T | null>;
  controlsRef?: Ref<MediaImageControls>;
  transform: MediaTransform;
  selected: boolean;
  onSelect(): void;
  onChange(transform: MediaTransform): void;
  preview(transform: MediaTransform): void;
  dragSize?(element: T): { width: number; height: number };
  interactionKey?: string;
};

export function useMediaAdjustment<T extends MediaElement>(options: Options<T>) {
  const { elementRef, controlsRef, transform, selected } = options;
  const latest = useRef(options);
  latest.current = options;
  const liveTransform = useRef(transform);
  const lastSubmittedTransform = useRef(transform);
  const pendingTransform = useRef<MediaTransform | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const drag = useRef<
    | {
        pointer: number;
        x: number;
        y: number;
        width: number;
        height: number;
        geometry: DragGeometry;
        start: MediaTransform;
      }
    | undefined
  >(undefined);
  const [dragging, setDragging] = useState(false);

  function flush() {
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const next = pendingTransform.current;
    pendingTransform.current = undefined;
    if (next) {
      lastSubmittedTransform.current = next;
      latest.current.onChange(next);
    }
    return liveTransform.current;
  }
  function cancel() {
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    pendingTransform.current = undefined;
    const pointer = drag.current?.pointer;
    drag.current = undefined;
    const element = elementRef.current;
    if (pointer !== undefined && element?.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
    setDragging(false);
  }
  function finishDrag() {
    const pointer = drag.current?.pointer;
    drag.current = undefined;
    flush();
    setDragging(false);
    const element = elementRef.current;
    if (pointer !== undefined && element?.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
  }
  useDragInterruption(finishDrag);
  useImperativeHandle(controlsRef, () => ({ flush, preview }), []);
  useEffect(() => {
    if (selected) elementRef.current?.focus({ preventScroll: true });
  }, [elementRef, selected]);
  useLayoutEffect(() => {
    // An earlier save can finish while the user is still moving or resizing the image.
    if (pendingTransform.current && sameMediaTransform(lastSubmittedTransform.current, transform)) return;
    if (!sameMediaTransform(liveTransform.current, transform)) cancel();
    liveTransform.current = transform;
    lastSubmittedTransform.current = transform;
    latest.current.preview(transform);
  }, [transform]);
  useLayoutEffect(() => {
    cancel();
    liveTransform.current = latest.current.transform;
    lastSubmittedTransform.current = liveTransform.current;
    latest.current.preview(liveTransform.current);
  }, [options.interactionKey]);
  useEffect(() => {
    const element = elementRef.current;
    return () => {
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
      pendingTransform.current = undefined;
      const pointer = drag.current?.pointer;
      drag.current = undefined;
      if (pointer !== undefined && element?.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
    };
  }, [elementRef]);

  function preview(next: MediaTransform) {
    liveTransform.current = clampMediaTransform(next);
    pendingTransform.current = liveTransform.current;
    latest.current.preview(liveTransform.current);
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 90);
  }
  function finish(event: PointerEvent<T>) {
    if (drag.current?.pointer !== event.pointerId) return;
    finishDrag();
  }
  return {
    dragging,
    onFocus: options.onSelect,
    onBlur: finishDrag,
    onPointerDown(event: PointerEvent<T>) {
      if (event.button !== 0 || drag.current || event.currentTarget.closest('fieldset[disabled]')) return;
      latest.current.onSelect();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      const canvas = event.currentTarget.closest(mediaCanvasSelector);
      const width = Math.max(1, canvas?.getBoundingClientRect().width ?? 1);
      const size = latest.current.dragSize?.(event.currentTarget) ?? {
        width: width * mediaOffsetWidthRatio,
        height: width * mediaOffsetHeightRatio
      };
      drag.current = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        width: Math.max(1, size.width),
        height: Math.max(1, size.height),
        geometry: dragGeometry(event.currentTarget),
        start: liveTransform.current
      };
      setDragging(true);
      event.preventDefault();
    },
    onPointerMove(event: PointerEvent<T>) {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      if (dragGeometryChanged(event.currentTarget, current.geometry)) {
        finishDrag();
        return;
      }
      preview({
        ...current.start,
        x: current.start.x + (event.clientX - current.x) / current.width,
        y: current.start.y + (event.clientY - current.y) / current.height
      });
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onKeyDown(event: KeyboardEvent<T>) {
      if (
        drag.current ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.currentTarget.closest('fieldset[disabled]')
      )
        return;
      const movement = event.shiftKey ? 0.05 : 0.012;
      const scale = event.shiftKey ? 0.1 : 0.04;
      const current = liveTransform.current;
      let next: MediaTransform | undefined;
      if (event.key === 'ArrowLeft') next = { ...current, x: current.x - movement };
      if (event.key === 'ArrowRight') next = { ...current, x: current.x + movement };
      if (event.key === 'ArrowUp') next = { ...current, y: current.y - movement };
      if (event.key === 'ArrowDown') next = { ...current, y: current.y + movement };
      if (event.key === '+' || event.key === '=') next = { ...current, scale: current.scale + scale };
      if (event.key === '-' || event.key === '_') next = { ...current, scale: current.scale - scale };
      if (event.key.toLowerCase() === 'f') next = toggleMediaFlip(current);
      if (!next) return;
      event.preventDefault();
      preview(next);
      // Save a tap immediately; held keys update the image until release or a pause.
      if (!event.repeat) flush();
    },
    onKeyUp(event: KeyboardEvent<T>) {
      if (!drag.current && /^(Arrow(Left|Right|Up|Down)|[+=\-_fF])$/.test(event.key)) flush();
    }
  };
}
