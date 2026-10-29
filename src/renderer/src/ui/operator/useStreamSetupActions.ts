import { useRef, type Dispatch, type SetStateAction } from 'react';
import type { OverlayState } from '@shared/models';
import type { StartggVideogame } from '@shared/startggVideogames';
import { api } from '../../api';
import { standaloneGameContext } from './generatorGameContext';

type StreamSetupOptions = {
  disabled: boolean;
  tournamentLoaded: boolean;
  withAutosavePaused(action: () => Promise<void>): Promise<void>;
  flushPlayerDefaults(): Promise<void>;
  onState(state: OverlayState): void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  onError(message: string): void;
  gameFailureMessage: string;
  clearFailureMessage: string;
};

export function useStreamSetupActions({
  disabled,
  tournamentLoaded,
  withAutosavePaused,
  flushPlayerDefaults,
  onState,
  setLoading,
  onError,
  gameFailureMessage,
  clearFailureMessage
}: StreamSetupOptions) {
  const busy = useRef(false);
  async function run(action: (updatedAt: string) => Promise<OverlayState>, failureMessage: string) {
    if (disabled || busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      await withAutosavePaused(async () => {
        await flushPlayerDefaults();
        // A pending draft save may change the live version, so read it afterward.
        const current = await api.state();
        onState(await action(current.selectedSet.updatedAt));
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : failureMessage);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return {
    selectExhibitionGame: async (game: StartggVideogame) => {
      if (tournamentLoaded) return;
      const context = standaloneGameContext(game);
      const assetCatalogSlug = context.assetCatalogSlug;
      if (!assetCatalogSlug) return;
      await run(
        (updatedAt) =>
          api.selectExhibitionGame({
            // Other games use the standard single-character scoring profile.
            gameId: context.gameId ?? 'street-fighter-6',
            gameName: context.gameName ?? game.name,
            videogameId: game.id,
            assetCatalogSlug,
            updatedAt
          }),
        gameFailureMessage
      );
    },
    clearPlayers: () => run(api.clearPlayerDetails, clearFailureMessage)
  };
}
