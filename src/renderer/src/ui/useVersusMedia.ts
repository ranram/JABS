import { useEffect, useState } from 'react';
import type { PlayerMediaMatch, PlayerState, SelectedSetState } from '@shared/models';
import { versusPresentationMode } from '@shared/versusScreen';
import { playerCharacters, playerPortraitCharacters } from '@shared/characterTeams';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import { useCatalogRevision } from '../hooks/useCatalogRevision';
import { api } from '../api';
import { loadCharacterPortraits, type CharacterPortrait } from '../characterPortraits';

export type SubjectMedia = {
  characterUrl?: string;
  photoUrl?: string;
  sponsorUrl?: string;
  characterPortraits?: CharacterPortrait[];
  hasCatalogCharacterMedia?: boolean;
};

export function useVersusMedia(selectedSet: SelectedSetState | undefined): { media: [SubjectMedia, SubjectMedia]; ready: boolean } {
  const revision = useCatalogRevision();
  const slug = selectedSet?.assetCatalogSlug ?? selectedSet?.gameId;
  // Changing scores or the match title should not reload the players' artwork.
  const key =
    selectedSet && versusPresentationMode(selectedSet) !== 'waiting'
      ? JSON.stringify({
          slug,
          players: [selectedSet.playerOne, selectedSet.playerTwo].map((player) => ({
            name: player.name,
            playerPhotoAssetId: player.playerPhotoAssetId,
            sponsor: player.sponsor ?? player.prefix,
            characters: playerCharacters(player),
            characterAssetId: player.characterAssetId
          }))
        })
      : undefined;
  const [resolved, setResolved] = useState<{ key: string; media: [SubjectMedia, SubjectMedia] }>();
  useEffect(() => {
    let active = true;
    if (!selectedSet || !key) return;
    const gameSlug = selectedSet.assetCatalogSlug ?? selectedSet.gameId;
    void Promise.all([api.playerMedia(), api.gameCharacterAssets(gameSlug)])
      .then(async ([matches, assets]) => {
        const hasCatalogCharacterMedia = assets.assets.some((asset) => Boolean(asset.assetId || asset.portraitAssetId));
        async function resolve(player: PlayerState, match: PlayerMediaMatch): Promise<SubjectMedia> {
          const characterAssetId = selectedCharacterAssetId(player, assets.assets);
          const [characterUrl, photoUrl, sponsorUrl, characterPortraits] = await Promise.all([
            characterAssetId ? api.gameCharacterAssetUrl(gameSlug, characterAssetId) : undefined,
            (player.playerPhotoAssetId ?? match.playerPhotoAssetId) ? api.playerPhotoAssetUrl(player.playerPhotoAssetId ?? match.playerPhotoAssetId!).catch(() => undefined) : undefined,
            match.sponsorLogoAssetId ? api.sponsorLogoAssetUrl(match.sponsorLogoAssetId) : undefined,
            loadCharacterPortraits(gameSlug, playerPortraitCharacters(player), assets.assets)
          ]);
          return { characterUrl, photoUrl, sponsorUrl, characterPortraits, hasCatalogCharacterMedia };
        }
        const next = await Promise.all([
          resolve(selectedSet.playerOne, matches.playerOne),
          resolve(selectedSet.playerTwo, matches.playerTwo)
        ]);
        if (active) setResolved({ key, media: next });
      })
      .catch(() => {
        if (active) setResolved((current) => (current?.key === key ? current : { key, media: [{}, {}] }));
      });
    return () => {
      active = false;
    };
  }, [key, revision]);
  return {
    media: resolved && resolved.key === key ? resolved.media : [{}, {}],
    ready: !key || resolved?.key === key
  };
}
