import { useAppearance } from './appearance/AppearanceProvider';
import { useLayoutEffect, useRef } from 'react';

type ScoreboardText = {
  name: string;
  sponsor: string;
  details?: string;
  pronouns?: string;
  xHandle?: string;
  themeId: string;
};

export function useScoreboardTextFit({ name, sponsor, details, pronouns, xHandle, themeId }: ScoreboardText) {
  const {
    appearance,
    state: { scoreboardFont }
  } = useAppearance();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const copy = ref.current;
    const identity = copy?.querySelector<HTMLElement>('.overlay-player-identity');
    const text = copy?.querySelector<HTMLElement>('.overlay-player-name');
    if (!copy || !identity || !text) return;
    const metadata = copy.querySelector<HTMLElement>('.overlay-player-meta');
    let active = true;

    function fitText() {
      if (!active || !copy || !identity || !text) return;
      // Reset first so a shorter name or a taller theme can use its original size.
      text.style.removeProperty('font-size');
      const metadataHeight = metadata?.getBoundingClientRect().height ?? 0;
      const gap = metadataHeight > 0 ? Number.parseFloat(getComputedStyle(copy).rowGap) || 0 : 0;
      const availableHeight = copy.clientHeight - metadataHeight - gap - 1;
      const availableWidth = identity.clientWidth - 1;
      if (availableHeight <= 0 || availableWidth <= 0) return;

      // Measure full font heights, including fallback scripts, within the fixed HUD area.
      for (let pass = 0; pass < 2; pass += 1) {
        const requiredHeight = identity.getBoundingClientRect().height;
        const requiredWidth = text.scrollWidth;
        const scale = Math.min(1, availableHeight / requiredHeight, availableWidth / requiredWidth);
        if (scale >= 1) break;
        const size = Number.parseFloat(getComputedStyle(text).fontSize);
        text.style.fontSize = `${size * scale}px`;
      }
    }

    fitText();
    const observer = new ResizeObserver(fitText);
    observer.observe(copy);
    void document.fonts?.ready.then(fitText);
    document.fonts?.addEventListener('loadingdone', fitText);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', fitText);
      text.style.removeProperty('font-size');
    };
  }, [name, sponsor, details, pronouns, xHandle, themeId, appearance.textSize, scoreboardFont]);

  return ref;
}
