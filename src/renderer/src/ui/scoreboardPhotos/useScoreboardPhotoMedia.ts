import { useEffect, useState } from 'react';
import type { ScoreboardPhoto, ScoreboardPhotoIdentity } from '@shared/scoreboardPhotos';
import type { IdentityMediaInput, SelectedSetState } from '@shared/models';
import { api } from '../../api';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { readLogoContent, type ScoreboardLogoContent } from './scoreboardLogoBackdrop';

export type LoadedScoreboardPhoto = ScoreboardPhoto & { url: string; width: number; height: number };

export function useScoreboardLogoContent(url?: string) {
  const [loaded, setLoaded] = useState<{ url: string; content: ScoreboardLogoContent }>();
  useEffect(() => {
    if (!url) return;
    let active = true;
    const image = new Image();
    image.src = url;
    void image
      .decode()
      .then(() => {
        if (active && image.naturalWidth > 0 && image.naturalHeight > 0) {
          // Read a bounded alpha sample once per logo, shared by both photo panels.
          setLoaded({ url, content: readLogoContent(image) });
        }
      })
      .catch(() => {
        // Keep the existing fit if dimensions cannot be read.
      });
    return () => {
      active = false;
    };
  }, [url]);
  return loaded?.url === url ? loaded?.content : undefined;
}

export function useScoreboardSponsorLogos(set: SelectedSetState | undefined, enabled: boolean) {
  const revision = useCatalogRevision();
  const identities = set
    ? [set.playerOne, set.playerTwo].map(({ name, prefix, sponsor }) => ({ name, prefix, sponsor }))
    : [];
  const key = JSON.stringify(identities);
  const [loaded, setLoaded] = useState<{ key: string; urls: Array<string | undefined> }>();
  useEffect(() => {
    if (!enabled) return;
    const identities = JSON.parse(key) as IdentityMediaInput[];
    if (!identities.length) return;
    let active = true;
    void api
      .identityMedia(identities)
      .then(({ matches }) =>
        Promise.all(
          matches.map((match) =>
            match.sponsorLogoAssetId
              ? api.sponsorLogoAssetUrl(match.sponsorLogoAssetId).catch(() => undefined)
              : undefined
          )
        )
      )
      .then((urls) => {
        if (active) setLoaded({ key, urls });
      })
      .catch(() => {
        // Keep a known logo during a failed refresh, only for the same identities.
      });
    return () => {
      active = false;
    };
  }, [enabled, key, revision]);
  return enabled && loaded?.key === key ? loaded.urls : [];
}

export async function loadScoreboardPhoto(photo: ScoreboardPhoto): Promise<LoadedScoreboardPhoto> {
  const url = await (photo.source === 'headshot'
    ? api.playerHeadshotAssetUrl(photo.assetId)
    : api.playerPhotoAssetUrl(photo.assetId));
  const image = new Image();
  image.src = url;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 64_000_000)
    throw new Error('Invalid player image dimensions.');
  return { ...photo, url, width: image.naturalWidth, height: image.naturalHeight };
}

export function useScoreboardPhotoMedia(players: ScoreboardPhotoIdentity[], enabled: boolean) {
  const revision = useCatalogRevision();
  const key = JSON.stringify(players);
  const [loaded, setLoaded] = useState<ReadonlyMap<string, LoadedScoreboardPhoto | undefined>>(() => new Map());
  useEffect(() => {
    let active = true;
    if (!enabled) return;
    const identities = JSON.parse(key) as ScoreboardPhotoIdentity[];
    void api
      .resolveScoreboardPhotos(identities)
      .then(async ({ photos }) => {
        if (!active) return;
        const results = await Promise.allSettled(
          identities.map((_, index) => {
            const photo = photos[index];
            return photo ? loadScoreboardPhoto(photo) : undefined;
          })
        );
        if (!active) return;
        setLoaded((previous) => {
          const next = new Map<string, LoadedScoreboardPhoto | undefined>();
          for (const [index, identity] of identities.entries()) {
            const identityKey = JSON.stringify(identity);
            const result = results[index];
            // A failed refresh preserves the decoded photo; a confirmed absence clears it.
            next.set(identityKey, result.status === 'fulfilled' ? result.value : previous.get(identityKey));
          }
          return next;
        });
      })
      .catch(() => {
        // A failed lookup cannot confirm that an existing photo was removed.
      });
    return () => {
      active = false;
    };
  }, [enabled, key, revision]);
  return enabled ? players.map((player) => loaded.get(JSON.stringify(player))) : [];
}
