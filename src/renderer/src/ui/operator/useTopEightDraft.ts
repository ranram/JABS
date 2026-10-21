import { mergeSavedPlayerDefaults, useSavedPlayerDefaults } from '../players/useSavedPlayerDefaults';
import { useEffect, useState } from 'react';
import { matchCharacterName } from '@shared/characterRosters';
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
import { generatorCharacterSelection } from './generatorGameContext';

export type TopEightDraftController = {
  draft: TopEightDraft;
  mediaPlacements: PlayerMediaPlacement[];
  selectedLayer?: { entrant: number; layer: MediaLayerKind };
  setSelectedLayer(value: { entrant: number; layer: MediaLayerKind } | undefined): void;
  setGameContext(gameId: GameId | undefined, gameName: string | undefined, assetCatalogSlug?: string): void;
  setStyling(stylingGameId: GameId): void;
  setAssetCatalogSlug(assetCatalogSlug: string): void;
  setStyle(style: TopEightStyleId): void;
  setMediaMode(mediaMode: TopEightMediaMode): void;
  setTournamentName(value: string): void;
  setHeadline(value: string): void;
  setHeadlineColor(value: string): void;
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
  useSavedPlayerDefaults(
    draft.entrants,
    draft.assetCatalogSlug,
    (original, saved) => {
      setDraft((current) => ({
        ...current,
        entrants: current.entrants.map((entrant, index) =>
          mergeSavedPlayerDefaults(entrant, original[index], saved[index])
        )
      }));
    },
    draft.eventUrl
  );
  const [selectedLayer, setSelectedLayer] = useState<{ entrant: number; layer: MediaLayerKind }>();
  useEffect(
    () => setSelectedLayer(undefined),
    [draft.gameId, draft.stylingGameId, draft.style, draft.mediaMode, ...draft.entrants.map((player) => player.name)]
  );
  const [mediaPlacements, setMediaPlacements] = useState<PlayerMediaPlacement[]>(createMediaPlacements);
  return {
    draft,
    mediaPlacements,
    selectedLayer,
    setSelectedLayer,
    setGameContext(gameId, gameName, assetCatalogSlug) {
      setDraft((current) => ({
        ...current,
        gameId,
        assetCatalogSlug: assetCatalogSlug ?? current.assetCatalogSlug,
        gameName: gameName?.trim() || (gameId ? gameProfiles[gameId].label : current.gameName),
        entrants: current.entrants.map((entrant) => ({
          ...entrant,
          ...generatorCharacterSelection(
            entrant,
            current.assetCatalogSlug,
            assetCatalogSlug ?? current.assetCatalogSlug
          )
        }))
      }));
      setMediaPlacements(createMediaPlacements());
    },
    setStyling: (stylingGameId) => setDraft((current) => ({ ...current, stylingGameId })),
    setAssetCatalogSlug: (assetCatalogSlug) => setDraft((current) => ({ ...current, assetCatalogSlug })),
    setStyle: (style) => setDraft((current) => ({ ...current, style })),
    setMediaMode: (mediaMode) => setDraft((current) => ({ ...current, mediaMode })),
    setTournamentName: (tournamentName) => setDraft((current) => ({ ...current, tournamentName })),
    setHeadline: (headline) => setDraft((current) => ({ ...current, headline })),
    setHeadlineColor: (headlineColor) => setDraft((current) => ({ ...current, headlineColor })),
    setLogo: (logoAssetId) => setDraft((current) => ({ ...current, logoAssetId })),
    setBackground: (background) => setDraft((current) => ({ ...current, background })),
    setEventUrl: (eventUrl) => setDraft((current) => ({ ...current, eventUrl })),
    setParticipantCount: (participantCount) => setDraft((current) => ({ ...current, participantCount })),
    setEntrant(index, patch) {
      setDraft((current) => ({
        ...current,
        entrants: current.entrants.map((entrant, entrantIndex) =>
          entrantIndex === index ? { ...entrant, ...patch } : entrant
        )
      }));
    },
    setMediaTransform(index, layer, transform) {
      if (draft.mediaMode !== 'combined' && layer !== (draft.mediaMode === 'photo' ? 'photo' : 'character')) return;
      setMediaPlacements((current) =>
        current.map((placement, placementIndex) =>
          placementIndex === index ? { ...placement, [layer]: clampMediaTransform(transform) } : placement
        )
      );
    },
    resetMediaTransform(index, layer) {
      if (draft.mediaMode !== 'combined' && layer !== (draft.mediaMode === 'photo' ? 'photo' : 'character')) return;
      setMediaPlacements((current) =>
        current.map((placement, placementIndex) =>
          placementIndex === index ? { ...placement, [layer]: defaultPlayerMediaPlacement()[layer] } : placement
        )
      );
    },
    useFinalStandings(result) {
      setDraft((current) => ({
        ...current,
        tournamentName: result.eventName,
        eventUrl: result.eventUrl,
        participantCount: result.numEntrants,
        entrants: result.standings.map((standing) => {
          const existing = current.entrants.find(
            (entrant) => Boolean(standing.playerId) && entrant.playerId === standing.playerId
          );
          const importedCharacter = current.gameId ? matchCharacterName(current.gameId, standing.character) : undefined;
          const characterChanged = Boolean(importedCharacter && importedCharacter !== existing?.character);
          return {
            playerId: standing.playerId ?? undefined,
            localPlayerId: existing?.localPlayerId,
            playerPhotoAssetId: existing?.playerPhotoAssetId,
            portraitAssetId: characterChanged ? undefined : existing?.portraitAssetId,
            placement: standing.placement,
            name: standing.name,
            character: importedCharacter ?? existing?.character,
            characters: importedCharacter ? [importedCharacter] : existing?.characters,
            characterAssetId: characterChanged ? undefined : existing?.characterAssetId,
            sponsor: standing.prefix ?? existing?.sponsor,
            xHandle: standing.xHandle ?? existing?.xHandle,
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
