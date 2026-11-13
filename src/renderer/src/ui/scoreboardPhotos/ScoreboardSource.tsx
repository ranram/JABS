import { createContext, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { SelectedSetState } from '@shared/models';
import { scoreboardPhotoExtension, scoreboardPhotoLayout } from '@shared/scoreboardPhotos';
import './scoreboardSource.css';

export const ScoreboardSourceHeadroomContext = createContext<number | undefined>(undefined);

function subscribeResize(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}

function hasPhotoHeadroom() {
  return window.innerHeight >= window.innerWidth * (1140 / 1920);
}

export function ScoreboardSource({ children, selectedSet }: { children: ReactNode; selectedSet: SelectedSetState }) {
  const hasRoom = useSyncExternalStore(subscribeResize, hasPhotoHeadroom);
  const extension = hasRoom ? scoreboardPhotoExtension(scoreboardPhotoLayout(selectedSet), 'extendAbove') : 0;
  return (
    <ScoreboardSourceHeadroomContext.Provider value={extension}>
      <div
        className={`scoreboard-source${extension ? ' has-photo-headroom' : ''}`}
        style={{ '--scoreboard-source-headroom': `${extension / 19.2}vw` } as CSSProperties}
      >
        {children}
      </div>
    </ScoreboardSourceHeadroomContext.Provider>
  );
}
