import { useEffect, useState } from 'react';
import { playerCharacters, playerPortraitCharacters } from '@shared/characterTeams';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import type { GameCharacterAsset } from '@shared/models';
import { useCatalogRevision } from '../../hooks/useCatalogRevision';
import { api } from '../../api';
import { loadCharacterPortraits, type CharacterPortrait } from '../../characterPortraits';
import { nextGeneratorWarning, type GeneratorWarning } from './useGeneratorWarningToast';
import { generatorCharacterKey, generatorIdentityKey, type GeneratorSubject } from './generatorMediaKeys';

const identityLookupDelayMs = 250;
const emptyCharacterAssets: GameCharacterAsset[] = [];

export type GeneratorSubjectMedia = {
  characterUrl?: string;
  playerPhotoUrl?: string;
  sponsorLogoUrl?: string;
  characterPortraits: CharacterPortrait[];
};

type GeneratorMediaOptions<TDraft> = {
  draft: TDraft;
  subjects: readonly GeneratorSubject[];
  assetCatalogSlug: string;
  assetCatalogRevision: number;
  context: { tournamentName?: string; headline?: string };
};

/** Resolves the common identity and character media pipeline used by graphic generators. */
export function useGeneratorMedia<TDraft>({
  draft,
  subjects,
  assetCatalogSlug,
  assetCatalogRevision,
  context
}: GeneratorMediaOptions<TDraft>): {
  previewDraft: TDraft;
  media: GeneratorSubjectMedia[];
  characterAssets: GameCharacterAsset[];
  availableCharacterNames: string[];
  warning?: GeneratorWarning;
  ready: boolean;
  refreshing: boolean;
} {
  const catalogRevision = useCatalogRevision();
  const [preview, setPreview] = useState<{ draft: TDraft; media: GeneratorSubjectMedia[]; contentKey?: string }>(
    () => ({
      draft,
      media: subjects.map(() => ({ characterPortraits: [] }))
    })
  );
  const [resolvedIdentityKey, setResolvedIdentityKey] = useState<string>();
  const [identityMedia, setIdentityMedia] = useState<
    Array<Pick<GeneratorSubjectMedia, 'playerPhotoUrl' | 'sponsorLogoUrl'>>
  >([]);
  const [characterCatalog, setCharacterCatalog] = useState<{
    key: string;
    slug: string;
    assets: GameCharacterAsset[];
  }>();
  const [characterMedia, setCharacterMedia] = useState<{
    key: string;
    urls: Array<string | undefined>;
    portraits: Record<string, CharacterPortrait>;
  }>();
  const [warning, setWarning] = useState<GeneratorWarning>();
  const [identityWarning, setIdentityWarning] = useState<GeneratorWarning>();

  const identityInputs = subjects.map(({ name, sponsor }) => ({ name, sponsor }));
  const identityKey = generatorIdentityKey(subjects, context);
  const revisionKey = JSON.stringify([assetCatalogRevision, catalogRevision]);
  const identityMediaKey = JSON.stringify([identityKey, revisionKey]);
  const catalogKey = JSON.stringify([assetCatalogSlug, revisionKey]);
  const characterKey = generatorCharacterKey(subjects);
  const contentKey = JSON.stringify([assetCatalogSlug, identityKey, characterKey]);
  const characterMediaKey = JSON.stringify([catalogKey, characterKey]);
  const characterAssets = characterCatalog?.slug === assetCatalogSlug ? characterCatalog.assets : emptyCharacterAssets;
  const currentCharacterMedia = characterMedia?.key === characterMediaKey ? characterMedia : undefined;

  useEffect(() => {
    let active = true;
    // Keep the current artwork visible until its replacement is ready.
    void api
      .gameCharacterAssets(assetCatalogSlug)
      .then(({ assets }) => {
        if (!active) return;
        setCharacterCatalog({ key: catalogKey, slug: assetCatalogSlug, assets });
      })
      .catch((error) => {
        if (!active) return;
        setWarning((current) => nextGeneratorWarning(error, current));
      });
    return () => {
      active = false;
    };
  }, [catalogKey]);

  useEffect(() => {
    let active = true;
    if (characterCatalog?.key !== catalogKey) return;
    const teams = subjects.map((subject) => playerCharacters(subject));
    const portraits = [...new Set(teams.flatMap((team) => team.slice(1)))];
    const leadAssetIds = subjects.map((subject) => selectedCharacterAssetId(subject, characterAssets));
    void Promise.all([
      loadCharacterPortraits(assetCatalogSlug, portraits, characterAssets),
      Promise.all(
        leadAssetIds.map((assetId) => (assetId ? api.gameCharacterAssetUrl(assetCatalogSlug, assetId) : undefined))
      )
    ])
      .then(([resolvedPortraits, resolvedCharacters]) => {
        if (!active) return;
        setCharacterMedia({
          key: characterMediaKey,
          urls: resolvedCharacters,
          portraits: Object.fromEntries(resolvedPortraits.map((portrait) => [portrait.character, portrait]))
        });
        setWarning(undefined);
      })
      .catch((error) => {
        if (active) setWarning((current) => nextGeneratorWarning(error, current));
      });
    return () => {
      active = false;
    };
  }, [catalogKey, characterCatalog, characterMediaKey]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (identityInputs.some(({ name }) => !name.trim())) {
        setIdentityMedia([]);
        setResolvedIdentityKey(identityMediaKey);
        setIdentityWarning(undefined);
        return;
      }
      void api
        .identityMedia(identityInputs, context)
        .then(async ({ matches }) =>
          Promise.all(
            matches.map(async (match, index) => {
              const playerPhotoAssetId = subjects[index]?.playerPhotoAssetId ?? match.playerPhotoAssetId;
              return {
                playerPhotoUrl: playerPhotoAssetId
                  ? await api.playerPhotoAssetUrl(playerPhotoAssetId).catch(() => undefined)
                  : undefined,
                sponsorLogoUrl: match.sponsorLogoAssetId
                  ? await api.sponsorLogoAssetUrl(match.sponsorLogoAssetId)
                  : undefined
              };
            })
          )
        )
        .then((resolved) => {
          if (!active) return;
          setIdentityMedia(resolved);
          setResolvedIdentityKey(identityMediaKey);
          setIdentityWarning(undefined);
        })
        .catch((error) => {
          if (!active) return;
          setIdentityWarning((current) => nextGeneratorWarning(error, current));
        });
    }, identityLookupDelayMs);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [identityMediaKey]);

  useEffect(() => {
    if (resolvedIdentityKey !== identityMediaKey || !currentCharacterMedia) return;
    // Show the new names and images together once both requests have finished.
    setPreview({
      draft,
      contentKey,
      media: subjects.map((subject, index) => ({
        ...identityMedia[index],
        characterUrl: currentCharacterMedia.urls[index],
        characterPortraits: playerPortraitCharacters(subject).flatMap((character) =>
          currentCharacterMedia.portraits[character] ? [currentCharacterMedia.portraits[character]] : []
        )
      }))
    });
  }, [draft, identityMediaKey, resolvedIdentityKey, currentCharacterMedia, identityMedia, contentKey]);

  const ready = preview.draft === draft && resolvedIdentityKey === identityMediaKey && Boolean(currentCharacterMedia);

  return {
    previewDraft: preview.draft,
    media: preview.media,
    ready,
    refreshing: !ready && preview.contentKey === contentKey,
    characterAssets,
    availableCharacterNames: characterAssets.map((asset) => asset.character),
    warning: warning ?? identityWarning
  };
}
