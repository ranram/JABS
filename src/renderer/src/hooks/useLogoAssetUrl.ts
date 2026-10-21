import { useEffect, useState } from 'react';
import { api } from '../api';
import { useCatalogRevision } from './useCatalogRevision';

export function useLogoAsset(assetId?: string): { url?: string; ready: boolean } {
  const revision = useCatalogRevision();
  const [resolved, setResolved] = useState<{ assetId: string; url?: string }>();
  useEffect(() => {
    let active = true;
    if (assetId) {
      void api.logoAssetUrl(assetId).then(
        (url) => { if (active) setResolved({ assetId, url }); },
        () => { if (active) setResolved((current) => current?.assetId === assetId ? current : { assetId }); }
      );
    }
    return () => { active = false; };
  }, [assetId, revision]);
  return {
    url: resolved?.assetId === assetId ? resolved?.url : undefined,
    ready: !assetId || resolved?.assetId === assetId
  };
}

export function useLogoAssetUrl(assetId?: string): string | undefined {
  return useLogoAsset(assetId).url;
}
