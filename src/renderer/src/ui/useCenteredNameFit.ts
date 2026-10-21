import { useLayoutEffect, useRef } from 'react';
import { useAppearance } from './appearance/AppearanceProvider';

/** Measure the entire centered identity, including overflow on its left edge. */
export function useCenteredNameFit(identity: string, textSelector: string) {
  const ref = useRef<HTMLElement>(null);
  const { appearance } = useAppearance();
  useLayoutEffect(() => {
    const row = ref.current;
    const text = row?.querySelector<HTMLElement>(textSelector);
    if (!row || !text) return;
    let active = true;
    const fit = () => {
      if (!active) return;
      // Always return to the selected size before fitting, including decreases.
      row.style.removeProperty('font-size');
      // Preview transforms can be zero while a panel opens. Layout dimensions
      // remain usable and do not change during entrance animations or scaling.
      const width = row.clientWidth;
      const height = row.clientHeight;
      if (!width || !height) return;
      for (let pass = 0; pass < 3; pass++) {
        const requiredWidth = Math.max(text.scrollWidth, text.offsetWidth);
        const requiredHeight = Math.max(text.scrollHeight, text.offsetHeight);
        if (!requiredWidth || !requiredHeight) return;
        const ratio = Math.min(1, (width - 2) / requiredWidth, (height - 2) / requiredHeight);
        if (ratio >= 1) break;
        row.style.fontSize = `${parseFloat(getComputedStyle(row).fontSize) * Math.max(0.001, ratio) * 0.98}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    void document.fonts?.ready.then(fit);
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
  }, [identity, textSelector, appearance.textSize]);
  return ref;
}
