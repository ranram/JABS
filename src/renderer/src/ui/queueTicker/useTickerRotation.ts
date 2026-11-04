import { useEffect, useState } from 'react';
import type { QueueTickerSnapshot } from '@shared/queueTicker';

export const TICKER_SCROLL_PIXELS_PER_SECOND = 48;
const SCROLL_MS = { standard: 13500, compact: 7000 } as const;
const HOLD_MS = 1500;

export function useTickerRotation(cycle: boolean, style: QueueTickerSnapshot['settings']['style']) {
  const [lane, setLane] = useState<'upcoming' | 'results'>('upcoming');
  const [entered, setEntered] = useState(false);
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    setLane('upcoming');
    setEntered(false);
    setHolding(false);
  }, [cycle, style]);
  useEffect(() => {
    if (!cycle) return;
    setHolding(false);
    const hold = setTimeout(() => setHolding(true), SCROLL_MS[style]);
    const next = setTimeout(() => {
      setEntered(true);
      setLane((current) => (current === 'upcoming' ? 'results' : 'upcoming'));
    }, SCROLL_MS[style] + HOLD_MS);
    return () => {
      clearTimeout(hold);
      clearTimeout(next);
    };
  }, [cycle, lane, style]);
  return { lane, entered, holding };
}
