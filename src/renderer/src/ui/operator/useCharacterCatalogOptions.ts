import { useEffect, useMemo, useState } from 'react';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import type { GameCharacterAsset } from '@shared/models';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { api } from '../../api';

export type CharacterCatalogOptions = {
  characters: readonly string[];
  assets: readonly GameCharacterAsset[];
};

export function useCharacterCatalogOptions(
  assetCatalogSlug: string | undefined,
  assetCatalogRevision: number
): CharacterCatalogOptions {
  const catalogRevision = useCatalogRevision();
  const [assets, setAssets] = useState<GameCharacterAsset[]>([]);

  useEffect(() => {
    let active = true;
    setAssets([]);
    if (!assetCatalogSlug) {
      return () => { active = false; };
    }
    void api.gameCharacterAssets(assetCatalogSlug).then(
      ({ assets }) => {
        if (active) setAssets(assets);
      },
      () => {
        if (active) setAssets([]);
      }
    );
    return () => { active = false; };
  }, [assetCatalogRevision, assetCatalogSlug, catalogRevision]);

  return useMemo(() => ({
    characters: [...new Set([
      ...charactersForAssetCatalog(assetCatalogSlug ?? ''),
      ...assets.map((asset) => asset.character)
    ])],
    assets
  }), [assetCatalogSlug, assets]);
}
