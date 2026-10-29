import { useEffect, useMemo, useState } from 'react';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import type { GameCharacterAsset } from '@shared/models';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { api } from '../../api';

const emptyAssets: readonly GameCharacterAsset[] = [];

export type CharacterCatalogOptions = {
  characters: readonly string[];
  assets: readonly GameCharacterAsset[];
};

export function useCharacterCatalogOptions(
  assetCatalogSlug: string | undefined,
  assetCatalogRevision: number
): CharacterCatalogOptions {
  const catalogRevision = useCatalogRevision();
  const [catalog, setCatalog] = useState<{ slug: string; assets: GameCharacterAsset[] }>();
  const assets = catalog && catalog.slug === assetCatalogSlug ? catalog.assets : emptyAssets;

  useEffect(() => {
    let active = true;
    if (!assetCatalogSlug) {
      return () => {
        active = false;
      };
    }
    void api.gameCharacterAssets(assetCatalogSlug).then(
      ({ assets }) => {
        if (active) setCatalog({ slug: assetCatalogSlug, assets });
      },
      () => undefined
    );
    return () => {
      active = false;
    };
  }, [assetCatalogRevision, assetCatalogSlug, catalogRevision]);

  return useMemo(
    () => ({
      characters: [
        ...new Set([...charactersForAssetCatalog(assetCatalogSlug ?? ''), ...assets.map((asset) => asset.character)])
      ],
      assets
    }),
    [assetCatalogSlug, assets]
  );
}
