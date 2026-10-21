import { gameAssetCatalogSlug } from '../../../../shared/gameAssetCatalog';
import { gameIdForStartggVideogame, type GameId } from '../../../../shared/gameProfiles';
import type { SelectedSetState, StartggEvent } from '../../../../shared/models';
import { characterTeamSelection, playerCharacters } from '@shared/characterTeams';

/** Keep outfits within the same game; another catalog starts with its own saved defaults. */
export function generatorCharacterSelection(
  player: { character?: string; characters?: string[]; characterAssetId?: string; portraitAssetId?: string },
  currentCatalog: string,
  nextCatalog: string
) {
  return currentCatalog === nextCatalog
    ? characterTeamSelection(playerCharacters(player), player)
    : characterTeamSelection([]);
}

type GeneratorGameContextInput = {
  selectedEventId: string;
  tournamentLoaded?: boolean;
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
  tournamentLoaded,
  selectedEvent,
  detectedGameId,
  selectionGameId,
  activeSet
}: GeneratorGameContextInput): GeneratorGameContext {
  if (selectedEventId && selectedEvent?.videogame) {
    const selectedProfileId = detectedGameId ?? (selectionGameId || undefined);
    return {
      gameId: selectedProfileId,
      gameName: selectedEvent?.videogame?.name,
      assetCatalogSlug: detectedGameId ?? gameAssetCatalogSlug(selectedEvent?.videogame) ?? selectedProfileId
    };
  }

  if (tournamentLoaded || selectedEventId) return {};

  return {
    gameId: activeSet?.gameId,
    gameName: activeSet?.gameName,
    assetCatalogSlug: activeSet?.assetCatalogSlug ?? activeSet?.gameId
  };
}

export function standaloneGameContext(videogame: { id: string; name: string }): GeneratorGameContext {
  const gameId = gameIdForStartggVideogame(videogame);
  return {
    gameId,
    gameName: videogame.name || `Game ${videogame.id}`,
    assetCatalogSlug: gameId ?? gameAssetCatalogSlug(videogame)
  };
}
