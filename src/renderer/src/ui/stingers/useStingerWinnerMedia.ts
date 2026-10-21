import { useEffect, useState } from 'react';
import type { SelectedSetState } from '@shared/models';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import { api } from '../../api';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { announcementPresentation } from '../announcementPresentation';

export function useStingerWinnerMedia(selectedSet?: SelectedSetState) {
  const winner = selectedSet ? announcementPresentation(selectedSet)?.winner : undefined;
  const slug = selectedSet?.assetCatalogSlug ?? selectedSet?.gameId;
  const revision = useCatalogRevision();
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
  const [media, setMedia] = useState<{ key: string; photo?: string; character?: string }>();

  useEffect(() => {
    let disposed = false;
    if (!winner || !slug) return;
    void Promise.all([
      api
        .identityMedia([{ name: winner.name, prefix: winner.prefix, sponsor: winner.sponsor }])
        .then(async ({ matches }) => {
          const id = winner.playerPhotoAssetId ?? matches[0]?.playerPhotoAssetId;
          return id ? api.playerPhotoAssetUrl(id) : undefined;
        })
        .catch(() => undefined),
      api
        .gameCharacterAssets(slug)
        .then(async ({ assets }) => {
          const id = selectedCharacterAssetId(winner, assets);
          return id ? api.gameCharacterAssetUrl(slug, id) : undefined;
        })
        .catch(() => undefined)
    ]).then(([photo, character]) => {
      if (!disposed) setMedia({ key, photo, character });
    });
    return () => {
      disposed = true;
    };
  }, [key, revision]);
  return {
    winner,
    ready: !winner || media?.key === key,
    photo: media?.key === key ? media.photo : undefined,
    character: media?.key === key ? media.character : undefined
  };
}
