import { useEffect, useRef, useState } from 'react';
import type { TopEightMatchupsState } from '@shared/topEightMatchups';
import { TopEightMatchupsPresentation } from '../TopEightMatchupsOverlay';

export function TopEightMatchupsPreview({ state }: { state: TopEightMatchupsState }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const shell = shellRef.current; if (!shell) return;
    const update = () => setScale(shell.clientWidth / 1920); update();
    const observer = new ResizeObserver(update); observer.observe(shell);
    return () => observer.disconnect();
  }, []);
  return <div ref={shellRef} className={`top8-matchups-preview-shell${state.showBackground ? '' : ' is-transparent-preview'}`}><div className="top8-matchups-preview-stage" style={{ transform: `scale(${scale})` }}><TopEightMatchupsPresentation state={state} preview /></div></div>;
}
