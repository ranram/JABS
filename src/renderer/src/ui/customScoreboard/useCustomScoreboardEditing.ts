import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  customScoreboardRegion,
  clampCustomScoreboardRegion,
  type CustomScoreboard,
  type CustomScoreboardRegion,
  type CustomScoreboardRegionId
} from '@shared/customScoreboards';
import { pickCustomScoreboardRegion } from './customScoreboardHitTest';
import { dragGeometry, dragGeometryChanged, useDragInterruption, type DragGeometry } from '../useDragInterruption';

type Options = {
  scoreboard: CustomScoreboard;
  editingRegion?: CustomScoreboardRegionId;
  onSelectRegion?(region: CustomScoreboardRegionId): void;
  onMoveRegion?(region: CustomScoreboardRegionId, x: number, y: number): void;
};
type Drag = {
  element: HTMLElement;
  geometry: DragGeometry;
  id: CustomScoreboardRegionId;
  pointer: number;
  x: number;
  y: number;
  start: CustomScoreboardRegion;
  started: boolean;
};

export function useCustomScoreboardEditing({ scoreboard, editingRegion, onSelectRegion, onMoveRegion }: Options) {
  const drag = useRef<Drag | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const editable = Boolean(onMoveRegion);
  function releaseDrag() {
    const current = drag.current;
    drag.current = undefined;
    if (current?.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
  }
  function finishDrag() {
    releaseDrag();
    setDragging(false);
  }
  useDragInterruption(finishDrag, editable);
  useLayoutEffect(() => {
    releaseDrag();
    setDragging(false);
    return releaseDrag;
  }, [scoreboard.id, scoreboard.frameRevision, editable]);
  function move(id: CustomScoreboardRegionId, region: CustomScoreboardRegion, x: number, y: number) {
    const position = clampCustomScoreboardRegion(id, { ...region, x, y });
    onMoveRegion?.(id, position.x, position.y);
  }
  function finish(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    finishDrag();
  }
  return {
    dragging,
    onBlur: finishDrag,
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      if (!onMoveRegion || event.button !== 0 || drag.current) return;
      const regions = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-custom-scoreboard-region]')]
        .reverse()
        .sort((a, b) => (Number(getComputedStyle(b).zIndex) || 0) - (Number(getComputedStyle(a).zIndex) || 0));
      const current = regions.find((element) => element.dataset.customScoreboardRegion === editingRegion);
      const element = pickCustomScoreboardRegion(regions, event.clientX, event.clientY, event.altKey, current);
      const id = element?.dataset.customScoreboardRegion as CustomScoreboardRegionId | undefined;
      if (!id || (!onSelectRegion && id !== editingRegion)) return;
      event.preventDefault();
      event.stopPropagation();
      onSelectRegion?.(id);
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        element: event.currentTarget,
        geometry: dragGeometry(event.currentTarget),
        id,
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start: { ...customScoreboardRegion(scoreboard, id) },
        started: false
      };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      if (dragGeometryChanged(event.currentTarget, current.geometry)) {
        finishDrag();
        return;
      }
      if (!current.started) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 3) return;
        current.started = true;
        setDragging(true);
      }
      const bounds = event.currentTarget.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      move(
        current.id,
        current.start,
        Math.round(current.start.x + ((event.clientX - current.x) * 1920) / bounds.width),
        Math.round(current.start.y + ((event.clientY - current.y) * 1080) / bounds.height)
      );
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (drag.current || !editingRegion || !onMoveRegion || event.ctrlKey || event.metaKey || event.altKey) return;
      const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!movement) return;
      event.preventDefault();
      const region = customScoreboardRegion(scoreboard, editingRegion);
      const step = event.shiftKey ? 10 : 1;
      move(editingRegion, region, region.x + movement[0] * step, region.y + movement[1] * step);
    }
  };
}
