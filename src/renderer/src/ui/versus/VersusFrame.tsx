import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { getObsSourceActivity, subscribeObsSourceActivity } from '../../hooks/obsSourceActivity';
import { DisplayText } from '../DisplayText';
import { useAppearance } from '../appearance/AppearanceProvider';

const tickerPixelsPerSecond = 28;
const minimumTickerDurationSeconds = 18;

export function VersusFrame({ tickers, preview }: { tickers: [string, string]; preview?: boolean }) {
  const { appearance } = useAppearance();
  const { active } = useSyncExternalStore(subscribeObsSourceActivity, getObsSourceActivity);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  return (
    <>
      <div className="versus-frame" aria-hidden="true">
        <div className="versus-frame-border" data-entrance="frame" />
      </div>
      <div
        className={`versus-rails${preview || hidden || active === false || !appearance.entranceAnimations ? ' is-paused' : ''}`}
      >
        {tickers.map(
          (text, index) => text && <BorderTicker key={index} text={text} side={index === 0 ? 'left' : 'right'} />
        )}
      </div>
    </>
  );
}

function BorderTicker({ text, side }: { text: string; side: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cycle, setCycle] = useState({ copies: 1, duration: 24 });
  useLayoutEffect(() => {
    const viewport = ref.current;
    const copy = viewport?.querySelector<HTMLElement>('.versus-ticker-copy');
    if (!viewport || !copy) return;
    let disposed = false;
    // Fill each loop even when one player's text fits. Both rails keep moving
    // at the same reading speed without a long empty stretch between copies.
    const measure = () => {
      if (disposed || !viewport.isConnected || !copy.offsetHeight) return;
      const copies = Math.max(1, Math.ceil(viewport.clientHeight / copy.offsetHeight));
      const duration = Math.max(minimumTickerDurationSeconds, (copies * copy.offsetHeight) / tickerPixelsPerSecond);
      setCycle((previous) =>
        previous.copies === copies && previous.duration === duration ? previous : { copies, duration }
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(copy);
    measure();
    void document.fonts?.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [text]);
  return (
    <div className={`versus-rail versus-rail-${side}`} data-entrance={`ticker-${side}`}>
      <div ref={ref} className="versus-ticker" aria-label={text}>
        <div
          className="versus-ticker-track"
          style={{ '--versus-ticker-duration': `${cycle.duration}s` } as CSSProperties}
          aria-hidden="true"
        >
          {[0, 1].map((loop) => (
            <div className="versus-ticker-cycle" key={loop}>
              {Array.from({ length: cycle.copies }, (_, index) => (
                <span className="versus-ticker-copy" key={index}>
                  <DisplayText text={text} /> ·{' '}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
