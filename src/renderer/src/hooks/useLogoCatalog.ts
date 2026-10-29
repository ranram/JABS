import { useEffect, useState } from 'react';
import type { LogoAsset } from '@shared/models';
import { api } from '../api';
import { useCatalogRevision } from './useCatalogRevision';

export function useLogoCatalog() {
  const revision = useCatalogRevision();
  const [logos, setLogos] = useState<LogoAsset[]>([]);
  useEffect(() => {
    let active = true;
    void api.logos().then(
      ({ logos }) => {
        if (active) setLogos(logos);
      },
      () => undefined
    );
    return () => {
      active = false;
    };
  }, [revision]);
  return [logos, setLogos] as const;
}
