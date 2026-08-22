import { gameAssetCatalogSlug } from '../../../../shared/gameAssetCatalog';
import type { GameId } from '../../../../shared/gameProfiles';
import type { SelectedSetState, StartggEvent } from '../../../../shared/models';

type GeneratorGameContextInput = {
  selectedEventId: string;
  selectedEvent?: StartggEvent;
  detectedGameId?: GameId;
  selectionGameId: GameId | '';
  activeSet?: SelectedSetState;
};

export type GeneratorGameContext = {
  gameId?: GameId;
  gameName?: string;
  assetCatalogSlug?: string;
};

export function generatorGameContext({
  selectedEventId,
  selectedEvent,
  detectedGameId,
  selectionGameId,
  activeSet
}: GeneratorGameContextInput): GeneratorGameContext {
  if (selectedEventId) {
    const selectedProfileId = detectedGameId ?? (selectionGameId || undefined);
    return {
      gameId: selectedProfileId,
      gameName: selectedEvent?.videogame?.name,
      assetCatalogSlug: detectedGameId
        ?? gameAssetCatalogSlug(selectedEvent?.videogame)
        ?? selectedProfileId
    };
  }

  return {
    gameId: activeSet?.gameId,
    gameName: activeSet?.gameName,
    assetCatalogSlug: activeSet?.assetCatalogSlug ?? activeSet?.gameId
  };
}
