import { useEffect, useState } from 'react';
import { api } from '../api';
import { useCatalogRevision } from './useCatalogRevision';

export function useLogoAssetUrl(assetId?: string): string | undefined {
  const revision = useCatalogRevision();
  const [resolved, setResolved] = useState<{ assetId: string; revision: number; url: string }>();
  useEffect(() => {
    let active = true;
    if (assetId) {
      void api.logoAssetUrl(assetId).then(
        (url) => { if (active) setResolved({ assetId, revision, url }); },
        () => { if (active) setResolved(undefined); }
      );
    }
    return () => { active = false; };
  }, [assetId, revision]);
  return resolved?.assetId === assetId && resolved?.revision === revision ? resolved.url : undefined;
}
