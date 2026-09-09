import type { GameCharacterAsset } from './models';
import { playerCharacters } from './characterTeams';

type CharacterArtworkSubject = {
  character?: string;
  characters?: string[];
  characterAssetId?: string;
};

export type CharacterMediaKind = 'artwork' | 'portrait';

export function leadCharacterAsset(
  subject: CharacterArtworkSubject,
  assets: readonly GameCharacterAsset[]
): GameCharacterAsset | undefined {
  const lead = playerCharacters(subject)[0];
  return lead ? assets.find((asset) => asset.character === lead) : undefined;
}

export function selectedCharacterAssetId(
  subject: CharacterArtworkSubject,
  assets: readonly GameCharacterAsset[],
  mediaKind: CharacterMediaKind = 'artwork'
): string | undefined {
  const asset = leadCharacterAsset(subject, assets);
  if (!asset) return undefined;
  const selected = subject.characterAssetId;
  const variantId = mediaKind === 'portrait' ? 'portraitAssetId' : 'assetId';
  if (selected) {
    const selectedVariant = asset.variants.find((variant) =>
      variant.assetId === selected || variant.portraitAssetId === selected
    );
    const selectedMediaId = selectedVariant?.[variantId];
    if (selectedMediaId) return selectedMediaId;
  }
  return mediaKind === 'portrait' ? asset.portraitAssetId : asset.assetId;
}

export function characterOutfitOptions(
  subject: CharacterArtworkSubject,
  assets: readonly GameCharacterAsset[],
  mediaKind: CharacterMediaKind = 'artwork'
): Array<{ value: string; label: string }> {
  const asset = leadCharacterAsset(subject, assets);
  if (!asset) return [];
  const variantId = mediaKind === 'portrait' ? 'portraitAssetId' : 'assetId';
  return asset.variants.flatMap((variant) => {
    const value = variant[variantId];
    return value ? [{ value, label: variant.label }] : [];
  });
}
