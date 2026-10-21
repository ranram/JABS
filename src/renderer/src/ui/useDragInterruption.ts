import { useEffect, useRef } from 'react';
import { mediaCanvasSelector } from './mediaTransformCss';

export type DragGeometry = { left: number; top: number; width: number; height: number; pixelRatio: number };

export function dragGeometry(element: Element): DragGeometry {
  const stage =
    element.closest(`${mediaCanvasSelector}, .headshot-framing-preview, .custom-scoreboard-canvas`) ??
    element.parentElement ??
    element;
  const { left, top, width, height } = stage.getBoundingClientRect();
  return { left, top, width, height, pixelRatio: window.devicePixelRatio };
}

export function dragGeometryChanged(element: Element, original: DragGeometry): boolean {
  const current = dragGeometry(element);
  return (
    current.pixelRatio !== original.pixelRatio ||
    (['left', 'top', 'width', 'height'] as const).some((field) => Math.abs(current[field] - original[field]) > 0.5)
  );
}

/** Keep the last position and release the pointer when the window loses focus or resizes. */
export function useDragInterruption(finish: () => void, enabled = true) {
  const latest = useRef(finish);
  latest.current = finish;
  useEffect(() => {
    if (!enabled) return;
    const interrupt = () => latest.current();
    const hidden = () => {
      if (document.hidden) interrupt();
    };
    window.addEventListener('blur', interrupt);
    window.addEventListener('resize', interrupt);
    window.visualViewport?.addEventListener('resize', interrupt);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', interrupt);
      window.removeEventListener('resize', interrupt);
      window.visualViewport?.removeEventListener('resize', interrupt);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [enabled]);
}
