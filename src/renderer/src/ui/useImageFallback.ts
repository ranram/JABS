import { useState, type SyntheticEvent } from 'react';

/** Share missing/failed image handling between overlay and adjustable media. */
export function useImageFallback(src: string, fallbackSrc?: string) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const displayedSrc = fallbackSrc && failedSrc === src ? fallbackSrc : src;
  return {
    src: displayedSrc,
    placeholder: Boolean(fallbackSrc && displayedSrc === fallbackSrc),
    onLoad(event: SyntheticEvent<HTMLImageElement>) {
      event.currentTarget.style.removeProperty('display');
    },
    onError(event: SyntheticEvent<HTMLImageElement>) {
      if (fallbackSrc && displayedSrc !== fallbackSrc) setFailedSrc(src);
      else event.currentTarget.style.display = 'none';
    }
  };
}
