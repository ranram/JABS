import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { useGamePreparationRevision } from '../../hooks/useCatalogRevision';

export type GameAssetSelection = {
  assetCatalogSlug?: string;
  videogameId?: string;
};

export type GameAssetPreparationStatus = {
  loading: boolean;
  error?: string;
  rosterAvailable?: boolean;
};

export function useGameAssetPreparation(
  assetCatalogSlug?: string,
  selection?: GameAssetSelection
): GameAssetPreparationStatus {
  // Importing a set can change the draft's game. Don't fetch a roster with
  // the previous game's start.gg ID while its artwork folder is changing.
  const videogameId = selection?.assetCatalogSlug === assetCatalogSlug ? selection?.videogameId : undefined;
  const revision = useGamePreparationRevision();
  const [status, setStatus] = useState<GameAssetPreparationStatus>({ loading: false });
  const previousSelection = useRef<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (!assetCatalogSlug) {
      previousSelection.current = undefined;
      setStatus({ loading: false });
      return;
    }
    const key = JSON.stringify([assetCatalogSlug, videogameId]);
    // Returning to JABS checks the same folders quietly; a new game shows setup progress.
    if (previousSelection.current !== key) setStatus({ loading: true });
    previousSelection.current = key;
    void api
      .prepareGameCharacters(assetCatalogSlug, videogameId)
      .then((result) => {
        if (active) setStatus({ loading: false, rosterAvailable: result.rosterAvailable });
      })
      .catch((error: unknown) => {
        if (active) {
          setStatus({ loading: false, error: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => {
      active = false;
    };
  }, [assetCatalogSlug, videogameId, revision]);
  return status;
}
