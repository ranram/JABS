import { useCallback, useState } from 'react';
import type { GameCharacterAsset, IdentityMediaInput, PlayerMediaMatch } from '@shared/models';
import { api } from '../api';
import { BoundedPromiseCache } from '../boundedPromiseCache';
import { useCatalogRevision } from './useCatalogRevision';

/** Keep identity and catalog reads separate from changes to artwork and framing. */
export function useMediaLookups() {
  const revision = useCatalogRevision();
  const [identities] = useState(() => new BoundedPromiseCache<{ matches: PlayerMediaMatch[] }>(1));
  const [catalogs] = useState(() => new BoundedPromiseCache<{ assets: GameCharacterAsset[] }>(1));
  const lookupIdentities = useCallback(
    (inputs: IdentityMediaInput[]) =>
      identities.getOrCreate(JSON.stringify([revision, inputs]), () => api.identityMedia(inputs)),
    [identities, revision]
  );
  const loadCharacters = useCallback(
    (slug: string) => catalogs.getOrCreate(JSON.stringify([revision, slug]), () => api.gameCharacterAssets(slug)),
    [catalogs, revision]
  );
  return { revision, lookupIdentities, loadCharacters };
}
