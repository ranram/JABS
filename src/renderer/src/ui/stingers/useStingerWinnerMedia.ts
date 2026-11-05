import { useEffect, useState } from 'react';
import type { SelectedSetState } from '@shared/models';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import { api } from '../../api';
import { useMediaLookups } from '../../hooks/useMediaLookups';
import { announcementPresentation } from '../announcementPresentation';

export function useStingerWinnerMedia(selectedSet?: SelectedSetState) {
  const winner = selectedSet ? announcementPresentation(selectedSet)?.winner : undefined;
  const slug = selectedSet?.assetCatalogSlug ?? selectedSet?.gameId;
  const { lookupIdentities, loadCharacters } = useMediaLookups();
  const key = JSON.stringify([
    slug,
    winner?.name,
    winner?.prefix,
    winner?.sponsor,
    winner?.playerPhotoAssetId,
    winner?.characters,
    winner?.character,
    winner?.characterAssetId
  ]);
  const [media, setMedia] = useState<{ key: string; photo?: string; character?: string; sponsorLogo?: string }>();

  useEffect(() => {
    let disposed = false;
    if (!winner || !slug) return;
    void Promise.all([
      lookupIdentities([{ name: winner.name, prefix: winner.prefix, sponsor: winner.sponsor }])
        .catch(() => ({ matches: [] }))
        .then(async ({ matches }) => {
          const photoId = winner.playerPhotoAssetId ?? matches[0]?.playerPhotoAssetId;
          const logoId = matches[0]?.sponsorLogoAssetId;
          const [photo, sponsorLogo] = await Promise.all([
            photoId ? api.playerPhotoAssetUrl(photoId).catch(() => undefined) : undefined,
            logoId ? api.sponsorLogoAssetUrl(logoId).catch(() => undefined) : undefined
          ]);
          return { photo, sponsorLogo };
        }),
      loadCharacters(slug)
        .then(async ({ assets }) => {
          const id = selectedCharacterAssetId(winner, assets);
          return id ? api.gameCharacterAssetUrl(slug, id) : undefined;
        })
        .catch(() => undefined)
    ]).then(([identity, character]) => {
      if (!disposed) setMedia({ key, photo: identity.photo, sponsorLogo: identity.sponsorLogo, character });
    });
    return () => {
      disposed = true;
    };
  }, [key, lookupIdentities, loadCharacters]);
  return {
    winner,
    ready: !winner || media?.key === key,
    photo: media?.key === key ? media.photo : undefined,
    character: media?.key === key ? media.character : undefined,
    sponsorLogo: media?.key === key ? media.sponsorLogo : undefined
  };
}
