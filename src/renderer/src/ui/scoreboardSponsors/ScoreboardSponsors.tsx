import { createContext, useContext, type ReactNode } from 'react';
import type { SelectedSetState } from '@shared/models';
import { useScoreboardSponsorLogos } from '../scoreboardPhotos/useScoreboardPhotoMedia';

export const ScoreboardSponsorsContext = createContext<
  { urls: Array<string | undefined>; available: boolean } | undefined
>(undefined);

export function ScoreboardSponsors({ selectedSet, children }: { selectedSet?: SelectedSetState; children: ReactNode }) {
  const enabled = Boolean(
    selectedSet &&
    [selectedSet.playerOne, selectedSet.playerTwo].some((player) => player.sponsor?.trim() || player.prefix?.trim())
  );
  const urls = useScoreboardSponsorLogos(selectedSet, enabled);
  return (
    <ScoreboardSponsorsContext.Provider value={{ urls, available: enabled }}>
      {children}
    </ScoreboardSponsorsContext.Provider>
  );
}

export function usePlayerSponsorLogo(side: 'left' | 'right') {
  return useContext(ScoreboardSponsorsContext)?.urls[side === 'left' ? 0 : 1];
}
