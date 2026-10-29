import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SetSummary, StartggStreamAssignment } from '@shared/models';
import { SetResultRow } from './SetResultRow';

const windowingThreshold = 80;
const estimatedHeight = 112;
const overscanRows = 3;

// The surrounding grid owns responsive columns. Measure its cards so long names
// can grow naturally, rather than clipping them to a fixed virtual row height.
export function VirtualSetResults({
  sets,
  scrollRef,
  resetKey,
  assignments,
  queuePositions,
  activeSetId,
  disabled,
  onOpenSet
}: {
  sets: SetSummary[];
  scrollRef: RefObject<HTMLDivElement | null>;
  resetKey: string;
  assignments: ReadonlyMap<string, StartggStreamAssignment>;
  queuePositions: ReadonlyMap<string, number>;
  activeSetId?: string;
  disabled: boolean;
  onOpenSet(set: SetSummary): void;
}) {
  const virtual = sets.length > windowingThreshold;
  const [layout, setLayout] = useState({ columns: 1, height: 0, width: 0, gap: 12, padding: 10 });
  const [scrollTop, setScrollTop] = useState(0);
  const [focusedId, setFocusedId] = useState<string>();
  const heights = useRef(new Map<string, number>());
  const [measurement, setMeasurement] = useState(0);
  const pendingFocus = useRef<string>(undefined);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !virtual) return;
    let frame = 0;
    function resize() {
      if (!root || !root.clientWidth) return;
      const style = getComputedStyle(root);
      const next = {
        columns: style.gridTemplateColumns.split(/\s+/).length,
        height: root.clientHeight,
        width: root.clientWidth,
        gap: parseFloat(style.rowGap) || 0,
        padding: parseFloat(style.paddingTop) || 0
      };
      setLayout((previous) => {
        return Object.keys(next).every((key) => previous[key as keyof typeof next] === next[key as keyof typeof next])
          ? previous
          : next;
      });
    }
    function scroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollTop(root!.scrollTop);
      });
    }
    function focus() {
      const card = document.activeElement?.closest<HTMLElement>('.set-row');
      setFocusedId(card && root?.contains(card) ? card.dataset.setId : undefined);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    root.addEventListener('scroll', scroll, { passive: true });
    root.addEventListener('focusin', focus);
    // Focus can move to the filters without scrolling the list.
    const blur = () => queueMicrotask(focus);
    root.addEventListener('focusout', blur);
    resize();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', scroll);
      root.removeEventListener('focusin', focus);
      root.removeEventListener('focusout', blur);
    };
  }, [scrollRef, virtual]);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey, scrollRef]);

  useLayoutEffect(() => {
    heights.current.clear();
    setMeasurement((value) => value + 1);
  }, [layout.width, layout.columns]);

  const offsets = useMemo(() => {
    const result = [0];
    for (let index = 0; index < sets.length; index += layout.columns) {
      const height = Math.max(
        ...sets.slice(index, index + layout.columns).map((set) => heights.current.get(set.id) ?? estimatedHeight)
      );
      result.push(result[result.length - 1] + height + layout.gap);
    }
    return result;
  }, [sets, layout, measurement]);
  const rows = offsets.length - 1;
  const rowAt = (position: number) => {
    let low = 0;
    let high = rows;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (offsets[middle + 1] <= position) low = middle + 1;
      else high = middle;
    }
    return Math.min(low, rows - 1);
  };
  const start = virtual ? Math.max(0, rowAt(scrollTop - layout.padding) - overscanRows) : 0;
  const end = virtual ? Math.min(rows, rowAt(scrollTop + (layout.height || 600)) + overscanRows + 1) : rows;
  const ranges = [{ start, end }];
  // Scrolling with the mouse must not unmount a card that still has keyboard focus.
  const focusedIndex = focusedId ? sets.findIndex((set) => set.id === focusedId) : -1;
  const focusedRow = Math.floor(focusedIndex / layout.columns);
  if (focusedRow >= 0 && (focusedRow < start || focusedRow >= end)) {
    ranges.push({ start: focusedRow, end: focusedRow + 1 });
    ranges.sort((a, b) => a.start - b.start);
  }
  const rangeKey = ranges.map(({ start, end }) => `${start}:${end}`).join(',');

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root || !virtual) return;
    function navigate(event: KeyboardEvent) {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || disabled) return;
      const card = (event.target as HTMLElement).closest<HTMLElement>('.set-row');
      if (!card) return;
      const index = sets.findIndex((set) => set.id === card.dataset.setId);
      const next = sets[index + (event.shiftKey ? -1 : 1)];
      if (!next) return;
      event.preventDefault();
      const mounted = [...root!.querySelectorAll<HTMLElement>('.set-row')].find(
        (node) => node.dataset.setId === next.id
      );
      if (mounted) {
        mounted.focus();
        return;
      }
      pendingFocus.current = next.id;
      const row = Math.floor((index + (event.shiftKey ? -1 : 1)) / layout.columns);
      root!.scrollTop = offsets[row] + layout.padding;
      setScrollTop(root!.scrollTop);
      setFocusedId(next.id);
    }
    root.addEventListener('keydown', navigate);
    return () => root.removeEventListener('keydown', navigate);
  }, [scrollRef, virtual, sets, offsets, layout.columns, layout.padding, disabled]);

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const card = [...(scrollRef.current?.querySelectorAll<HTMLElement>('.set-row') ?? [])].find(
      (node) => node.dataset.setId === pendingFocus.current
    );
    if (card) {
      pendingFocus.current = undefined;
      card.focus({ preventScroll: true });
    }
  });

  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root || !virtual) return;
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const card = entry.target as HTMLElement;
        const id = card.dataset.setId!;
        const height = card.getBoundingClientRect().height;
        if (height > 0 && heights.current.get(id) !== height) {
          heights.current.set(id, height);
          changed = true;
        }
      }
      if (changed) setMeasurement((value) => value + 1);
    });
    root.querySelectorAll('.set-row').forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [scrollRef, sets, virtual, layout.width, layout.columns, rangeKey]);

  const spacer = (from: number, to: number) =>
    to > from && (
      <div
        key={`space-${from}`}
        className="set-results-spacer"
        aria-hidden="true"
        style={{ height: Math.max(0, offsets[to] - offsets[from] - layout.gap) }}
      />
    );
  let previousEnd = 0;
  const cards = ranges.flatMap(({ start, end }) => {
    const before = spacer(previousEnd, start);
    previousEnd = end;
    return [
      before,
      ...sets
        .slice(start * layout.columns, end * layout.columns)
        .map((set) => (
          <SetResultRow
            key={`set-${set.id}`}
            set={set}
            assignment={assignments.get(set.id)}
            queuePosition={queuePositions.get(set.id)}
            activeSetId={activeSetId}
            disabled={disabled}
            onOpenSet={onOpenSet}
          />
        ))
    ];
  });
  return (
    <>
      {cards}
      {spacer(previousEnd, rows)}
    </>
  );
}
