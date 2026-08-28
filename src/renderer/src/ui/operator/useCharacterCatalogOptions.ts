import { useEffect, useMemo, useState } from 'react';
import { charactersForAssetCatalog } from '@shared/characterRosters';
import type { GameCharacterAsset } from '@shared/models';
import { api } from '../../api';

export function useCharacterCatalogOptions(
  assetCatalogSlug: string | undefined,
  assetCatalogRevision: number
): { characters: string[]; assets: GameCharacterAsset[] } {
  const [assets, setAssets] = useState<GameCharacterAsset[]>([]);

  useEffect(() => {
    let active = true;
    if (!assetCatalogSlug) {
      setAssets([]);
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
  }, [assetCatalogRevision, assetCatalogSlug]);

  return useMemo(() => ({
    characters: [...new Set([
      ...charactersForAssetCatalog(assetCatalogSlug ?? ''),
      ...assets.map((asset) => asset.character)
    ])],
    assets
  }), [assetCatalogSlug, assets]);
}
