import { useCallback, useState } from 'react';
import type { GameCharacterAsset, IdentityMediaInput, PlayerMediaMatch } from '@shared/models';
import { api } from '../api';
import { BoundedPromiseCache } from '../boundedPromiseCache';
import { useCatalogRevision, useAssetRevision } from './useCatalogRevision';

/** Keep identity and catalog reads separate from changes to artwork and framing. */
export function useMediaLookups() {
  const revision = useCatalogRevision();
  const assetRevision = useAssetRevision();
  const [identities] = useState(() => new BoundedPromiseCache<{ matches: PlayerMediaMatch[] }>(1));
  const [catalogs] = useState(() => new BoundedPromiseCache<{ assets: GameCharacterAsset[] }>(1));
  const lookupIdentities = useCallback(
    (inputs: IdentityMediaInput[]) =>
      identities.getOrCreate(JSON.stringify([revision, inputs]), () => api.identityMedia(inputs)),
    [identities, revision]
  );
  const loadCharacters = useCallback(
    (slug: string) => catalogs.getOrCreate(JSON.stringify([assetRevision, slug]), () => api.gameCharacterAssets(slug)),
    [catalogs, assetRevision]
  );
  return { revision, lookupIdentities, loadCharacters };
}
