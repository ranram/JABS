import { useRef, type Dispatch, type SetStateAction } from 'react';
import type { OverlayState } from '@shared/models';
import type { StartggVideogame } from '@shared/startggVideogames';
import { api } from '../../api';
import { standaloneGameContext } from './generatorGameContext';

type ExhibitionGameSelectionOptions = {
  disabled: boolean;
  withAutosavePaused(action: () => Promise<void>): Promise<void>;
  flushPlayerDefaults(): Promise<void>;
  onState(state: OverlayState): void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  onError(message: string): void;
  failureMessage: string;
};

export function useExhibitionGameSelection({
  disabled,
  withAutosavePaused,
  flushPlayerDefaults,
  onState,
  setLoading,
  onError,
  failureMessage
}: ExhibitionGameSelectionOptions) {
  const busy = useRef(false);
  return async (game: StartggVideogame) => {
    if (disabled || busy.current) return;
    const context = standaloneGameContext(game);
    const assetCatalogSlug = context.assetCatalogSlug;
    if (!assetCatalogSlug) return;
    busy.current = true;
    setLoading(true);
    try {
      await withAutosavePaused(async () => {
        await flushPlayerDefaults();
        // A pending draft save may change the live version, so read it afterward.
        const current = await api.state();
        const response = await api.selectExhibitionGame({
          // Other games use the standard single-character scoring profile.
          gameId: context.gameId ?? 'street-fighter-6',
          gameName: context.gameName ?? game.name,
          videogameId: game.id,
          assetCatalogSlug,
          updatedAt: current.selectedSet.updatedAt
        });
        onState(response);
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : failureMessage);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };
}
