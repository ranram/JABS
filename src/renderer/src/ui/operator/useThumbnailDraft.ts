import { useEffect, useRef, useState } from 'react';
import { isCharacterForGame, matchCharacterName } from '@shared/characterRosters';
import { gameProfiles, type GameId } from '@shared/gameProfiles';
import type { SelectedSetState } from '@shared/models';
import { characterTeamSelection, playerCharacters } from '@shared/characterTeams';
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

export function useThumbnailDraft(activeSet?: SelectedSetState) {
  const [draft, setDraft] = useState<ThumbnailDraft>(() => createThumbnailDraft(activeSet?.gameId));
  const [mediaPlacements, setMediaPlacements] = useState<[PlayerMediaPlacement, PlayerMediaPlacement]>(() => [
    defaultPlayerMediaPlacement(),
    defaultPlayerMediaPlacement()
  ]);
  const importedSetId = useRef<string | undefined>(undefined);
  const useActiveSet = (selectedSet: SelectedSetState) => {
    setDraft((current) => ({
      ...current,
      gameId: selectedSet.gameId,
      gameName: selectedSet.gameName ?? gameProfiles[selectedSet.gameId].label,
      stylingGameId: selectedSet.stylingGameId ?? selectedSet.gameId,
      tournamentName: selectedSet.tournamentSlug?.replaceAll('-', ' ') || current.tournamentName,
      headline: thumbnailMatchHeadline(selectedSet),
      logoAssetId: selectedSet.broadcast?.logoEnabled ? selectedSet.broadcast.logoAssetId : current.logoAssetId,
      players: [
        playerFromSet(selectedSet.playerOne, selectedSet.gameId),
        playerFromSet(selectedSet.playerTwo, selectedSet.gameId)
      ]
    }));
    setMediaPlacements([defaultPlayerMediaPlacement(), defaultPlayerMediaPlacement()]);
  };
  useEffect(() => {
    if (activeSet?.setId && importedSetId.current !== activeSet.setId) {
      importedSetId.current = activeSet.setId;
      useActiveSet(activeSet);
    }
  }, [activeSet?.setId]);
  return {
    draft,
    mediaPlacements,
    setGameContext(gameId: GameId | undefined, gameName: string | undefined) {
      setDraft((current) => ({
        ...current,
        gameId,
        gameName: gameName?.trim() || (gameId ? gameProfiles[gameId].label : current.gameName),
        players: current.players.map((player) => {
          const characters = playerCharacters(player).filter(
            (character) => gameId && isCharacterForGame(gameId, character)
          );
          return { ...player, ...characterTeamSelection(characters) };
        }) as [ThumbnailPlayer, ThumbnailPlayer]
      }));
      setMediaPlacements([defaultPlayerMediaPlacement(), defaultPlayerMediaPlacement()]);
    },
    setStyling: (stylingGameId: GameId) => setDraft((current) => ({ ...current, stylingGameId })),
    setAssetCatalogSlug: (assetCatalogSlug: string) => setDraft((current) => ({ ...current, assetCatalogSlug })),
    setStyle: (style: ThumbnailStyleId) => setDraft((current) => ({ ...current, style })),
    setMediaMode: (mediaMode: ThumbnailMediaMode) => setDraft((current) => ({ ...current, mediaMode })),
    setText: (patch: Pick<Partial<ThumbnailDraft>, 'tournamentName' | 'headline' | 'logoAssetId'>) =>
      setDraft((current) => ({ ...current, ...patch })),
    setVisibility: (
      key: 'showTournamentLogo' | 'showSponsorLogo',
      value: boolean
    ) => setDraft((current) => ({ ...current, [key]: value })),
    setPlayer(index: 0 | 1, patch: Partial<ThumbnailPlayer>) {
      setDraft((current) => ({
        ...current,
        players: current.players.map((player, playerIndex) => (
          playerIndex === index ? { ...player, ...patch } : player
        )) as [ThumbnailPlayer, ThumbnailPlayer]
      }));
    },
    setMediaTransform(player: 0 | 1, layer: MediaLayerKind, transform: MediaTransform) {
      setMediaPlacements((current) => current.map((placement, index) => index === player
        ? { ...placement, [layer]: clampMediaTransform(transform) }
        : placement) as [PlayerMediaPlacement, PlayerMediaPlacement]);
    },
    resetMediaTransform(player: 0 | 1, layer: MediaLayerKind) {
      setMediaPlacements((current) => current.map((placement, index) => index === player
        ? { ...placement, [layer]: defaultMediaTransform() }
        : placement) as [PlayerMediaPlacement, PlayerMediaPlacement]);
    },
    useActiveSet
  };
}

function playerFromSet(player: SelectedSetState['playerOne'], gameId: GameId | undefined): ThumbnailPlayer {
  const characters = playerCharacters(player)
    .map((character) => gameId ? matchCharacterName(gameId, character) : character)
    .filter((character): character is string => Boolean(character));
  return {
    name: player.name,
    character: characters[0],
    characters: characters.length ? characters : undefined,
    sponsor: player.sponsor ?? player.prefix,
    country: player.country,
    displayFlag: player.displayFlag
  };
}
