import { useLayoutEffect, useRef } from 'react';

/** Fit only the match body; the full-height bezel, rails and bottom footer never scale. */
export function useVersusCardFit() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    const body = card?.querySelector<HTMLElement>('.versus-match-body');
    const footer = card?.querySelector<HTMLElement>('.versus-match-footer');
    if (!card || !body || !footer) return;
    const heights = new Map<Element, number>();
    let appliedScale = 1;
    const fit = () => {
      // Hidden accordion panels have no usable layout. Keep the last good fit
      // until the preview is visible instead of collapsing its content.
      if (!card.isConnected || !card.clientWidth || !card.clientHeight) return;
      const panelStyle = getComputedStyle(card);
      const pixels = (value: string) => Number.parseFloat(value) || 0;
      const inset =
        pixels(panelStyle.paddingTop) +
        pixels(panelStyle.paddingBottom) +
        pixels(panelStyle.borderTopWidth) +
        pixels(panelStyle.borderBottomWidth);
      // Measure independently of the visible zoom and name-fitting callbacks.
      // Otherwise media reloads can restart a loop between name width and height.
      const bodyHeight = naturalBodyHeight(body, card.clientWidth) + pixels(getComputedStyle(body).marginBottom);
      const footerHeight = heights.get(footer) ?? footer.offsetHeight;
      const frameHeight = heights.get(card) ?? card.offsetHeight;
      const available = frameHeight - inset - footerHeight;
      if (available <= 0) return;
      // Reserve a pixel for browser rounding above the pinned footer.
      const scale = bodyHeight <= available ? 1 : (available - 1) / Math.max(1, bodyHeight);
      const adjustment = Math.abs(scale - appliedScale) * bodyHeight;
      if (adjustment < 1 && appliedScale * bodyHeight <= available) return;
      appliedScale = Math.max(0.001, scale);
      card.style.setProperty('--versus-body-scale', String(appliedScale));
    };
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Preserve fractional measurements when reserving space above the footer.
        const height = entry.borderBoxSize[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight;
        if (height > 0) heights.set(entry.target, height);
        else heights.delete(entry.target);
      }
      fit();
    });
    observer.observe(body);
    observer.observe(footer);
    observer.observe(card);
    fit();
    return () => observer.disconnect();
  }, []);
  return ref;
}

function naturalBodyHeight(body: HTMLElement, width: number): number {
  const measurement = body.cloneNode(true) as HTMLElement;
  Object.assign(measurement.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    width: `${width}px`,
    zoom: '1'
  });
  measurement.setAttribute('aria-hidden', 'true');
  measurement.inert = true;
  // A full-size name gives a stable upper bound even while the visible name
  // refits to the wider logical line created by zoom. No pixels are painted.
  for (const name of measurement.querySelectorAll<HTMLElement>('.versus-name-row')) {
    name.style.removeProperty('font-size');
  }
  body.after(measurement);
  try {
    return Number.parseFloat(getComputedStyle(measurement).height) || measurement.offsetHeight;
  } finally {
    measurement.remove();
  }
}
