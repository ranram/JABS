import { useEffect, useState } from 'react';
import { api } from '../api';
import { useCatalogRevision } from './useCatalogRevision';
import { useLogoAssetUrl } from './useLogoAssetUrl';

/** Result and Versus surfaces fall back to the first reviewed tournament logo. */
export function useTournamentLogo(preferredAssetId: string | undefined, enabled: boolean): string | undefined {
  const revision = useCatalogRevision();
  const [selection, setSelection] = useState<{
    preferredAssetId?: string;
    assetId?: string;
    revision: number;
  }>();
  useEffect(() => {
    let active = true;
    if (enabled) {
      void api
        .logos()
        .then(({ logos }) => {
          const assetId = (logos.find(({ id }) => id === preferredAssetId) ?? logos[0])?.id;
          if (active) setSelection({ preferredAssetId, assetId, revision });
        })
        .catch(() => {
          if (active) setSelection(undefined);
        });
    }
    return () => {
      active = false;
    };
  }, [enabled, preferredAssetId, revision]);
  const assetId =
    enabled && selection?.revision === revision && selection?.preferredAssetId === preferredAssetId
      ? selection?.assetId
      : undefined;
  return useLogoAssetUrl(assetId);
}
