import { useLayoutEffect, type RefObject } from 'react';
import { compositeColor, parseColor, readableTextColor } from './textContrast';

const textSelector = '.overlay-player-prefix, .overlay-player-score, .overlay-match-chip strong, .overlay-info-text';

/** Recheck labels when the palette, template, or set of visible labels changes. */
export function useScoreboardContrast(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  presentationKey: string
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const changes: Array<{ element: HTMLElement; color: string; priority: string }> = [];
    const styles = new Map<Element, CSSStyleDeclaration>();
    function style(element: Element) {
      let computed = styles.get(element);
      if (!computed) {
        computed = getComputedStyle(element);
        styles.set(element, computed);
      }
      return computed;
    }

    // Read before writing, avoiding repeated style recalculation for each label.
    const adjustments = [...root.querySelectorAll<HTMLElement>(textSelector)].flatMap((element) => {
      const layers = [];
      let current: HTMLElement | null = element;
      while (current && root.contains(current)) {
        const background = parseColor(style(current).backgroundColor);
        if (background) {
          layers.push(background);
          if (background[3] === 1) break;
        }
        current = current.parentElement;
      }
      // OBS video and arbitrary images have no known backing; don't guess their color.
      if (layers.at(-1)?.[3] !== 1) return [];
      let backing: readonly [number, number, number] = [0, 0, 0];
      for (const layer of layers.reverse()) backing = compositeColor(layer, backing);
      const original = style(element).color;
      const readable = readableTextColor(original, backing);
      return readable && readable !== original ? [{ element, readable }] : [];
    });
    for (const { element, readable } of adjustments) {
      changes.push({
        element,
        color: element.style.getPropertyValue('color'),
        priority: element.style.getPropertyPriority('color')
      });
      element.style.color = readable;
    }
    return () => {
      for (const { element, color, priority } of changes) {
        if (color) element.style.setProperty('color', color, priority);
        else element.style.removeProperty('color');
      }
    };
  }, [rootRef, enabled, presentationKey]);
}
