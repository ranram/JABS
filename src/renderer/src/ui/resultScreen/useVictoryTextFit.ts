import { useLayoutEffect, useRef } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';

// Fit the combined identity to its line width; natural line height keeps details close.
export function useVictoryTextFit(identity: string, hasHero: boolean) {
  const ref = useRef<HTMLElement>(null);
  const { appearance } = useAppearance();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    function fit() {
      if (!active || !element) return;
      element.style.removeProperty('font-size');
      if (!element.clientWidth) return;
      for (let pass = 0; pass < 4; pass++) {
        const ratio = Math.min(1, element.clientWidth / element.scrollWidth);
        if (ratio >= 1) break;
        element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * ratio * 0.98}px`;
      }
    }
    fit();
    let lastWidth = element.parentElement?.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === lastWidth) return;
      lastWidth = entry.contentRect.width;
      fit();
    });
    if (element.parentElement) observer.observe(element.parentElement);
    void document.fonts?.ready.then(fit);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [identity, hasHero, appearance.textSize]);
  return ref;
}
