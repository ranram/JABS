import { useAppearance } from '../appearance/AppearanceProvider';
import { useLayoutEffect, useRef } from 'react';
import { DisplayText } from '../DisplayText';

export function TopEightName({ name, singleLine }: { name: string; singleLine: boolean }) {
  const { appearance } = useAppearance();
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const row = element?.parentElement;
    if (!element || !row) return;
    element.style.removeProperty('font-size');
    if (!singleLine) return;
    let active = true;

    function fitName() {
      if (!active || !element) return;
      // Start at the design's size so shorter names and wider cards can grow back.
      element.style.removeProperty('font-size');
      const available = element.clientWidth;
      const required = element.scrollWidth;
      if (available > 0 && required > available) {
        const size = Number.parseFloat(getComputedStyle(element).fontSize);
        element.style.fontSize = `${(size * Math.max(1, available - 1)) / required}px`;
      }
    }

    fitName();
    const observer = new ResizeObserver(fitName);
    observer.observe(row);
    void document.fonts?.ready.then(fitName);
    return () => {
      active = false;
      observer.disconnect();
      element.style.removeProperty('font-size');
    };
  }, [name, singleLine, appearance.textSize]);

  return (
    <strong ref={ref} data-export-text="wrapped">
      <DisplayText text={name} />
    </strong>
  );
}
