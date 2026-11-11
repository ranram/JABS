import { useEffect, useState } from 'react';
import type { PlayerMediaMatch, PlayerState, SelectedSetState } from '@shared/models';
import { versusPresentationMode } from '@shared/versusScreen';
import { playerCharacters, playerPortraitCharacters } from '@shared/characterTeams';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import { useMediaLookups } from '../hooks/useMediaLookups';
import { api } from '../api';
import { loadCharacterPortraits, type CharacterPortrait } from '../characterPortraits';
import {
  frameHighlightArtwork,
  highlightPlayerPhoto,
  type HighlightArtworkFrame
} from './resultScreen/highlightArtwork';

export type SubjectMedia = {
  characterAssetId?: string;
  photoAssetId?: string;
  characterUrl?: string;
  characterFrame?: HighlightArtworkFrame;
  photoUrl?: string;
  sponsorUrl?: string;
  characterPortraits?: CharacterPortrait[];
  hasCatalogCharacterMedia?: boolean;
};

export function useVersusMedia(
  selectedSet: SelectedSetState | undefined,
  frameArtwork = false
): {
  media: [SubjectMedia, SubjectMedia];
  ready: boolean;
} {
  const { revision, lookupIdentities, loadCharacters } = useMediaLookups();
  const slug = selectedSet?.assetCatalogSlug ?? selectedSet?.gameId;
  // Changing scores or the match title should not reload the players' artwork.
  const playerKeys =
    selectedSet && versusPresentationMode(selectedSet) !== 'waiting'
      ? [selectedSet.playerOne, selectedSet.playerTwo].map((player) =>
          JSON.stringify({
            slug,
            frameArtwork,
            playerId: frameArtwork ? player.playerId : undefined,
            localPlayerId: frameArtwork ? player.localPlayerId : undefined,
            name: player.name,
            playerPhotoAssetId: player.playerPhotoAssetId,
            prefix: player.prefix,
            sponsor: player.sponsor,
            characters: playerCharacters(player),
            characterAssetId: player.characterAssetId
          })
        )
      : undefined;
  const key = playerKeys ? JSON.stringify(playerKeys) : undefined;
  const [resolved, setResolved] = useState<{
    key: string;
    playerKeys: string[];
    media: [SubjectMedia, SubjectMedia];
  }>();
  useEffect(() => {
    let active = true;
    if (!selectedSet || !key) return;
    const gameSlug = selectedSet.assetCatalogSlug ?? selectedSet.gameId;
    const identities = [selectedSet.playerOne, selectedSet.playerTwo].map(({ name, prefix, sponsor }) => ({
      name,
      prefix,
      sponsor
    }));
    void Promise.all([
      lookupIdentities(identities).catch(() => ({ matches: [] })),
      loadCharacters(gameSlug).catch(() => ({ assets: [] }))
    ])
      .then(async ([{ matches }, assets]) => {
        const hasCatalogCharacterMedia = assets.assets.some((asset) => Boolean(asset.assetId || asset.portraitAssetId));
        async function resolve(player: PlayerState, match: PlayerMediaMatch): Promise<SubjectMedia> {
          const characterAssetId = selectedCharacterAssetId(player, assets.assets);
          const photoId = player.playerPhotoAssetId ?? match.playerPhotoAssetId;
          const fallbackPhoto = async () => ({
            assetId: photoId,
            url: photoId ? await api.playerPhotoAssetUrl(photoId).catch(() => undefined) : undefined
          });
          const [characterUrl, photo, sponsorUrl, characterPortraits] = await Promise.all([
            characterAssetId ? api.gameCharacterAssetUrl(gameSlug, characterAssetId).catch(() => undefined) : undefined,
            frameArtwork ? highlightPlayerPhoto(player, photoId).catch(fallbackPhoto) : fallbackPhoto(),
            match.sponsorLogoAssetId
              ? api.sponsorLogoAssetUrl(match.sponsorLogoAssetId).catch(() => undefined)
              : undefined,
            loadCharacterPortraits(gameSlug, playerPortraitCharacters(player), assets.assets).catch(() => [])
          ]);
          const [framedCharacter, framedPhoto] = frameArtwork
            ? await Promise.all([
                characterUrl ? frameHighlightArtwork(characterUrl, 'character').catch(() => undefined) : undefined,
                photo.url ? frameHighlightArtwork(photo.url, 'photo').catch(() => undefined) : undefined
              ])
            : [undefined, undefined];
          return {
            characterAssetId,
            photoAssetId: photo.assetId,
            characterUrl: framedCharacter?.url ?? characterUrl,
            characterFrame: framedCharacter?.frame,
            photoUrl: framedPhoto?.url ?? photo.url,
            sponsorUrl,
            characterPortraits,
            hasCatalogCharacterMedia
          };
        }
        const next = await Promise.all([
          resolve(selectedSet.playerOne, matches[0] ?? {}),
          resolve(selectedSet.playerTwo, matches[1] ?? {})
        ]);
        if (active) setResolved({ key, playerKeys: JSON.parse(key) as string[], media: next });
      })
      .catch(() => {
        if (!active) return;
        const nextKeys = JSON.parse(key) as string[];
        setResolved((current) => ({
          key,
          playerKeys: nextKeys,
          media: [0, 1].map((side) => (current?.playerKeys[side] === nextKeys[side] ? current.media[side] : {})) as [
            SubjectMedia,
            SubjectMedia
          ]
        }));
      });
    return () => {
      active = false;
    };
  }, [key, revision, lookupIdentities, loadCharacters]);
  return {
    media: [0, 1].map((side) =>
      playerKeys && resolved?.playerKeys[side] === playerKeys[side] ? resolved.media[side] : {}
    ) as [SubjectMedia, SubjectMedia],
    ready: !key || resolved?.key === key
  };
}
