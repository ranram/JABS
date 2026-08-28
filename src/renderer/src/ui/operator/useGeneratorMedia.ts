import { useEffect, useRef, useState } from 'react';
import { playerCharacters, playerPortraitCharacters } from '@shared/characterTeams';
import { selectedCharacterAssetId } from '@shared/characterAssets';
import type { GameCharacterAsset } from '@shared/models';
import { api } from '../../api';
import { loadCharacterPortraits, type CharacterPortrait } from '../../characterPortraits';
import { nextGeneratorWarning, type GeneratorWarning } from './useGeneratorWarningToast';
import { generatorCharacterKey, generatorIdentityKey } from './generatorMediaKeys';

type GeneratorSubject = {
  name: string;
  sponsor?: string;
  character?: string;
  characters?: string[];
  characterAssetId?: string;
};

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
} {
  const [previewDraft, setPreviewDraft] = useState(draft);
  const [resolvedIdentityKey, setResolvedIdentityKey] = useState<string>();
  const [identityMedia, setIdentityMedia] = useState<Array<Pick<GeneratorSubjectMedia, 'playerPhotoUrl' | 'sponsorLogoUrl'>>>([]);
  const [characterAssets, setCharacterAssets] = useState<GameCharacterAsset[]>([]);
  const [characterUrls, setCharacterUrls] = useState<Array<string | undefined>>([]);
  const [portraitUrls, setPortraitUrls] = useState<Record<string, CharacterPortrait>>({});
  const [warning, setWarning] = useState<GeneratorWarning>();
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  const identityInputs = subjects.map(({ name, sponsor }) => ({ name, sponsor }));
  const identityKey = generatorIdentityKey(subjects, context);
  const characterKey = generatorCharacterKey(subjects);

  useEffect(() => {
    let active = true;
    setCharacterAssets([]);
    setCharacterUrls([]);
    setPortraitUrls({});
    void api.gameCharacterAssets(assetCatalogSlug).then(({ assets }) => {
      if (!active) return;
      setCharacterAssets(assets);
    }).catch((error) => {
      if (!active) return;
      setWarning((current) => nextGeneratorWarning(error, current));
    });
    return () => { active = false; };
  }, [assetCatalogRevision, assetCatalogSlug]);

  useEffect(() => {
    let active = true;
    setCharacterUrls([]);
    const teams = subjects.map((subject) => playerCharacters(subject));
    const portraits = [...new Set(teams.flatMap((team) => team.slice(1)))];
    const leadAssetIds = subjects.map((subject) => selectedCharacterAssetId(subject, characterAssets));
    void Promise.all([
      loadCharacterPortraits(assetCatalogSlug, portraits, characterAssets),
      Promise.all(leadAssetIds.map((assetId) => assetId
        ? api.gameCharacterAssetUrl(assetCatalogSlug, assetId)
        : undefined))
    ]).then(([resolvedPortraits, resolvedCharacters]) => {
      if (!active) return;
      setPortraitUrls(Object.fromEntries(resolvedPortraits.map((portrait) => [portrait.character, portrait])));
      setCharacterUrls(resolvedCharacters);
    }).catch((error) => {
      if (active) setWarning((current) => nextGeneratorWarning(error, current));
    });
    return () => { active = false; };
  }, [assetCatalogSlug, characterAssets, characterKey]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (identityInputs.some(({ name }) => !name.trim())) {
        setIdentityMedia([]);
        setResolvedIdentityKey(identityKey);
        setPreviewDraft(latestDraft.current);
        return;
      }
      void api.identityMedia(identityInputs, context)
        .then(async ({ matches }) => Promise.all(matches.map(async (match) => ({
          playerPhotoUrl: match.playerPhotoAssetId
            ? await api.playerPhotoAssetUrl(match.playerPhotoAssetId) : undefined,
          sponsorLogoUrl: match.sponsorLogoAssetId
            ? await api.sponsorLogoAssetUrl(match.sponsorLogoAssetId) : undefined
        }))))
        .then((resolved) => {
          if (!active) return;
          setIdentityMedia(resolved);
          setResolvedIdentityKey(identityKey);
          setPreviewDraft(latestDraft.current);
          setWarning(undefined);
        })
        .catch((error) => {
          if (!active) return;
          setIdentityMedia([]);
          setWarning((current) => nextGeneratorWarning(error, current));
        });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [identityKey]);

  useEffect(() => {
    if (resolvedIdentityKey === identityKey) setPreviewDraft(draft);
  }, [draft, identityKey, resolvedIdentityKey]);

  return {
    previewDraft,
    media: subjects.map((subject, index) => ({
      ...identityMedia[index],
      characterUrl: characterUrls[index],
      characterPortraits: playerPortraitCharacters(subject).flatMap((character) =>
        portraitUrls[character] ? [portraitUrls[character]] : []
      )
    })),
    characterAssets,
    availableCharacterNames: characterAssets.map((asset) => asset.character),
    warning
  };
}

export function useLogoAssetUrl(assetId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    if (!assetId) {
      setUrl(undefined);
      return () => { active = false; };
    }
    void api.logoAssetUrl(assetId)
      .then((resolved) => { if (active) setUrl(resolved); })
      .catch(() => { if (active) setUrl(undefined); });
    return () => { active = false; };
  }, [assetId]);
  return url;
}
