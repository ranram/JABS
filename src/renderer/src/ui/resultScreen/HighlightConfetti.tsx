import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import confettiUrl from '../../assets/overlays/confetti.webm';
import { getObsSourceActivity, subscribeObsSourceActivity } from '../../hooks/obsSourceActivity';
import { useAppearance } from '../appearance/AppearanceProvider';
import { highlightConfettiAt } from './highlightEntrance';

export function HighlightConfetti({ ready, presentationKey }: { ready: boolean; presentationKey: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const played = useRef<string | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const { active, activation } = useSyncExternalStore(subscribeObsSourceActivity, getObsSourceActivity);
  const { appearance } = useAppearance();
  useEffect(() => {
    const element = video.current;
    setVisible(false);
    if (!element || !ready || active === false) return;
    const key = JSON.stringify([presentationKey, activation]);
    if (played.current === key) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        played.current = key;
        element.currentTime = 0;
        void element
          .play()
          .then(() => {
            if (!cancelled) setVisible(true);
          })
          .catch(() => undefined);
      },
      appearance.entranceAnimations ? appearance.entranceDelayMs + highlightConfettiAt : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      element.pause();
    };
  }, [ready, presentationKey, active, activation, appearance.entranceAnimations, appearance.entranceDelayMs]);
  return (
    <video
      ref={video}
      className="highlight-confetti"
      src={confettiUrl}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      style={{ visibility: visible ? 'visible' : 'hidden' }}
      onEnded={() => setVisible(false)}
      onError={() => setVisible(false)}
    />
  );
}
