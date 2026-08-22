import { useState } from 'react';
import { isCharacterForGame, matchCharacterName } from '@shared/characterRosters';
import { gameProfiles, type GameId } from '@shared/gameProfiles';
import type { StartggEventStandingsResult } from '@shared/models';
import {
  clampMediaTransform,
  defaultPlayerMediaPlacement,
  type MediaLayerKind,
  type MediaTransform,
  type PlayerMediaPlacement
} from '@shared/mediaPlacement';
import {
  createTopEightDraft,
  type TopEightDraft,
  type TopEightEntrant,
  type TopEightMediaMode,
  type TopEightStyleId
} from '@shared/topEight';
import { characterTeamSelection, playerCharacters } from '@shared/characterTeams';

export type TopEightDraftController = {
  draft: TopEightDraft;
  mediaPlacements: PlayerMediaPlacement[];
  setGameContext(gameId: GameId | undefined, gameName: string | undefined): void;
  setStyling(stylingGameId: GameId): void;
  setAssetCatalogSlug(assetCatalogSlug: string): void;
  setStyle(style: TopEightStyleId): void;
  setMediaMode(mediaMode: TopEightMediaMode): void;
  setTournamentName(value: string): void;
  setHeadline(value: string): void;
  setLogo(assetId: string | undefined): void;
  setBackground(background: TopEightDraft['background']): void;
  setEventUrl(value: string): void;
  setParticipantCount(value: number | undefined): void;
  setEntrant(index: number, patch: Partial<TopEightEntrant>): void;
  setMediaTransform(index: number, layer: MediaLayerKind, transform: MediaTransform): void;
  resetMediaTransform(index: number, layer: MediaLayerKind): void;
  useFinalStandings(result: StartggEventStandingsResult): void;
};

export function useTopEightDraft(initialGameId?: GameId): TopEightDraftController {
  const [draft, setDraft] = useState(() => createTopEightDraft(initialGameId));
  const [mediaPlacements, setMediaPlacements] = useState<PlayerMediaPlacement[]>(createMediaPlacements);
  return {
    draft,
    mediaPlacements,
    setGameContext(gameId, gameName) {
      setDraft((current) => ({
        ...current,
        gameId,
        gameName: gameName?.trim() || (gameId ? gameProfiles[gameId].label : current.gameName),
        entrants: current.entrants.map((entrant) => {
          const characters = playerCharacters(entrant).filter(
            (character) => gameId && isCharacterForGame(gameId, character)
          );
          return { ...entrant, ...characterTeamSelection(characters) };
        })
      }));
      setMediaPlacements(createMediaPlacements());
    },
    setStyling: (stylingGameId) => setDraft((current) => ({ ...current, stylingGameId })),
    setAssetCatalogSlug: (assetCatalogSlug) => setDraft((current) => ({ ...current, assetCatalogSlug })),
    setStyle: (style) => setDraft((current) => ({ ...current, style })),
    setMediaMode: (mediaMode) => setDraft((current) => ({ ...current, mediaMode })),
    setTournamentName: (tournamentName) => setDraft((current) => ({ ...current, tournamentName })),
    setHeadline: (headline) => setDraft((current) => ({ ...current, headline })),
    setLogo: (logoAssetId) => setDraft((current) => ({ ...current, logoAssetId })),
    setBackground: (background) => setDraft((current) => ({ ...current, background })),
    setEventUrl: (eventUrl) => setDraft((current) => ({ ...current, eventUrl })),
    setParticipantCount: (participantCount) => setDraft((current) => ({ ...current, participantCount })),
    setEntrant(index, patch) {
      setDraft((current) => ({
        ...current,
        entrants: current.entrants.map((entrant, entrantIndex) => (
          entrantIndex === index ? { ...entrant, ...patch } : entrant
        ))
      }));
    },
    setMediaTransform(index, layer, transform) {
      setMediaPlacements((current) => current.map((placement, placementIndex) => placementIndex === index
        ? { ...placement, [layer]: clampMediaTransform(transform) }
        : placement));
    },
    resetMediaTransform(index, layer) {
      setMediaPlacements((current) => current.map((placement, placementIndex) => placementIndex === index
        ? { ...placement, [layer]: defaultPlayerMediaPlacement()[layer] }
        : placement));
    },
    useFinalStandings(result) {
      setDraft((current) => ({
        ...current,
        tournamentName: result.eventName,
        eventUrl: result.eventUrl,
        participantCount: result.numEntrants,
        entrants: result.standings.map((standing) => {
          const existing = current.entrants.find((entrant) => entrant.name === standing.name);
          const importedCharacter = current.gameId
            ? matchCharacterName(current.gameId, standing.character)
            : undefined;
          return {
            placement: standing.placement,
            name: standing.name,
            character: importedCharacter ?? existing?.character,
            characters: importedCharacter
              ? [importedCharacter]
              : existing?.characters,
            sponsor: standing.prefix ?? existing?.sponsor,
            country: standing.country ?? existing?.country,
            displayFlag: existing?.displayFlag
          };
        })
      }));
      setMediaPlacements(createMediaPlacements());
    }
  };
}

function createMediaPlacements(): PlayerMediaPlacement[] {
  return Array.from({ length: 8 }, defaultPlayerMediaPlacement);
}
