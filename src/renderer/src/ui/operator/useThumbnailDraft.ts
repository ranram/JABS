import { mergeSavedPlayerDefaults, useSavedPlayerDefaults } from '../players/useSavedPlayerDefaults';
import { useEffect, useRef, useState } from 'react';
import { matchCharacterName } from '@shared/characterRosters';
import { gameProfiles, type GameId } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';
import { generatorCharacterSelection, type GeneratorGameContext } from './generatorGameContext';
import { playerCharacters } from '@shared/characterTeams';
import {
  clampMediaTransform,
  defaultMediaTransform,
  defaultPlayerMediaPlacement,
  type MediaLayerKind,
  type MediaTransform,
  type PlayerMediaPlacement
} from '@shared/mediaPlacement';
import {
  createThumbnailDraft,
  thumbnailMatchHeadline,
  type ThumbnailDraft,
  type ThumbnailMediaMode,
  type ThumbnailPlayer,
  type ThumbnailStyleId
} from '@shared/thumbnail';

export type ThumbnailDraftController = ReturnType<typeof useThumbnailDraft>;

export function useThumbnailDraft(activeSet?: SelectedSetState, eventContext?: GeneratorGameContext) {
  const [draft, setDraft] = useState<ThumbnailDraft>(() => createThumbnailDraft(activeSet?.gameId));
  useSavedPlayerDefaults(
    draft.players,
    draft.assetCatalogSlug,
    (original, saved) => {
      setDraft((current) => ({
        ...current,
        players: current.players.map((player, index) =>
          mergeSavedPlayerDefaults(player, original[index], saved[index])
        ) as [ThumbnailPlayer, ThumbnailPlayer]
      }));
    },
    draft.sourceSetId
  );
  const [mediaPlacements, setMediaPlacements] = useState<[PlayerMediaPlacement, PlayerMediaPlacement]>(() => [
    defaultPlayerMediaPlacement(),
    defaultPlayerMediaPlacement()
  ]);
  const [selectedLayer, setSelectedLayer] = useState<{ player: 0 | 1; layer: MediaLayerKind }>();
  useEffect(
    () => setSelectedLayer(undefined),
    [draft.gameId, draft.stylingGameId, draft.style, draft.mediaMode, draft.players[0].name, draft.players[1].name]
  );
  const importedSetId = useRef<string | undefined>(undefined);
  const useActiveSet = (selectedSet: SelectedSetState) => {
    const gameId = eventContext ? eventContext.gameId : selectedSet.gameId;
    setDraft((current) => ({
      ...current,
      sourceSetId: selectedSet.setId,
      gameId,
      assetCatalogSlug: eventContext?.assetCatalogSlug ?? selectedSet.assetCatalogSlug ?? selectedSet.gameId,
      gameName: eventContext?.gameName ?? selectedSet.gameName ?? gameProfiles[selectedSet.gameId].label,
      stylingGameId: selectedSet.stylingGameId ?? selectedSet.gameId,
      tournamentName:
        selectedSet.tournamentName?.trim() ||
        selectedSet.tournamentSlug?.replaceAll('-', ' ') ||
        current.tournamentName,
      headline: thumbnailMatchHeadline(selectedSet),
      players: [playerFromSet(selectedSet.playerOne, gameId), playerFromSet(selectedSet.playerTwo, gameId)]
    }));
    setMediaPlacements([defaultPlayerMediaPlacement(), defaultPlayerMediaPlacement()]);
  };
  useEffect(() => {
    if (!activeSet?.setId) importedSetId.current = undefined;
    if (activeSet?.setId && importedSetId.current !== activeSet.setId) {
      importedSetId.current = activeSet.setId;
      useActiveSet(activeSet);
    }
  }, [activeSet?.setId]);
  return {
    draft,
    mediaPlacements,
    selectedLayer,
    setSelectedLayer,
    setGameContext(gameId: GameId | undefined, gameName: string | undefined, assetCatalogSlug?: string) {
      setDraft((current) => ({
        ...current,
        gameId,
        assetCatalogSlug: assetCatalogSlug ?? current.assetCatalogSlug,
        gameName: gameName?.trim() || (gameId ? gameProfiles[gameId].label : current.gameName),
        players: current.players.map((player) => ({
          ...player,
          ...generatorCharacterSelection(player, current.assetCatalogSlug, assetCatalogSlug ?? current.assetCatalogSlug)
        })) as [ThumbnailPlayer, ThumbnailPlayer]
      }));
      setMediaPlacements([defaultPlayerMediaPlacement(), defaultPlayerMediaPlacement()]);
    },
    setStyling: (stylingGameId: GameId) => setDraft((current) => ({ ...current, stylingGameId })),
    setAssetCatalogSlug: (assetCatalogSlug: string) => setDraft((current) => ({ ...current, assetCatalogSlug })),
    setStyle: (style: ThumbnailStyleId) => setDraft((current) => ({ ...current, style })),
    setMediaMode: (mediaMode: ThumbnailMediaMode) => setDraft((current) => ({ ...current, mediaMode })),
    setBackground: (background: ThumbnailDraft['background']) => setDraft((current) => ({ ...current, background })),
    setText: (patch: Pick<Partial<ThumbnailDraft>, 'tournamentName' | 'headline' | 'headlineColor' | 'logoAssetId'>) =>
      setDraft((current) => ({ ...current, ...patch })),
    setVisibility: (key: 'showTournamentLogo' | 'showSponsorLogo', value: boolean) =>
      setDraft((current) => ({ ...current, [key]: value })),
    setPlayer(index: 0 | 1, patch: Partial<ThumbnailPlayer>) {
      setDraft((current) => ({
        ...current,
        players: current.players.map((player, playerIndex) =>
          playerIndex === index ? { ...player, ...patch } : player
        ) as [ThumbnailPlayer, ThumbnailPlayer]
      }));
    },
    setMediaTransform(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform) {
      if (draft.mediaMode !== 'combined' && layer !== (draft.mediaMode === 'photo' ? 'photo' : 'character')) return;
      setMediaPlacements(
        (current) =>
          current.map((placement, index) =>
            index === player ? { ...placement, [layer]: clampMediaTransform(transform) } : placement
          ) as [PlayerMediaPlacement, PlayerMediaPlacement]
      );
    },
    resetMediaTransform(player: 0 | 1, layer: MediaLayerKind) {
      if (draft.mediaMode !== 'combined' && layer !== (draft.mediaMode === 'photo' ? 'photo' : 'character')) return;
      setMediaPlacements(
        (current) =>
          current.map((placement, index) =>
            index === player ? { ...placement, [layer]: defaultMediaTransform() } : placement
          ) as [PlayerMediaPlacement, PlayerMediaPlacement]
      );
    },
    useActiveSet,
    restoreModeratedActiveSet(selectedSet: SelectedSetState) {
      const gameId = eventContext ? eventContext.gameId : selectedSet.gameId;
      const refreshedPlayers = [
        playerFromSet(selectedSet.playerOne, gameId),
        playerFromSet(selectedSet.playerTwo, gameId)
      ] as [ThumbnailPlayer, ThumbnailPlayer];
      setDraft((current) => ({
        ...current,
        headline: current.headline.includes('[blocked]') ? thumbnailMatchHeadline(selectedSet) : current.headline,
        players: current.players.map((player, index) => ({
          ...player,
          name: player.name === '[blocked]' ? refreshedPlayers[index]!.name : player.name,
          sponsor: player.sponsor === '[blocked]' ? refreshedPlayers[index]!.sponsor : player.sponsor,
          character: player.character === '[blocked]' ? refreshedPlayers[index]!.character : player.character,
          characters: player.characters?.map((character, characterIndex) =>
            character === '[blocked]' ? (refreshedPlayers[index]!.characters?.[characterIndex] ?? character) : character
          )
        })) as [ThumbnailPlayer, ThumbnailPlayer]
      }));
    }
  };
}

function playerFromSet(player: SelectedSetState['playerOne'], gameId: GameId | undefined): ThumbnailPlayer {
  const characters = playerCharacters(player)
    .map((character) => (gameId ? matchCharacterName(gameId, character) : character))
    .filter((character): character is string => Boolean(character));
  return {
    localPlayerId: player.localPlayerId,
    playerId: player.playerId,
    playerPhotoAssetId: player.playerPhotoAssetId,
    portraitAssetId: characters[0] === player.character ? player.portraitAssetId : undefined,
    name: player.name,
    character: characters[0],
    characters: characters.length ? characters : undefined,
    characterAssetId: characters[0] === player.character ? player.characterAssetId : undefined,
    sponsor: player.sponsor ?? player.prefix,
    country: player.country,
    displayFlag: player.displayFlag
  };
}
