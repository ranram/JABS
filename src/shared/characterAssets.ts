import type { GameCharacterAsset } from './models';
import { playerCharacters } from './characterTeams';

type CharacterArtworkSubject = {
  character?: string;
  characters?: string[];
  characterAssetId?: string;
};

export function leadCharacterAsset(
  subject: CharacterArtworkSubject,
  assets: readonly GameCharacterAsset[]
): GameCharacterAsset | undefined {
  const lead = playerCharacters(subject)[0];
  return lead ? assets.find((asset) => asset.character === lead) : undefined;
}

export function selectedCharacterAssetId(
  subject: CharacterArtworkSubject,
  assets: readonly GameCharacterAsset[]
): string | undefined {
  const asset = leadCharacterAsset(subject, assets);
  if (!asset) return undefined;
  const selected = subject.characterAssetId;
  if (selected && asset.variants.some((variant) => variant.assetId === selected)) {
    return selected;
  }
  return asset.assetId;
}

export function characterOutfitOptions(
  subject: CharacterArtworkSubject,
  assets: readonly GameCharacterAsset[]
): Array<{ value: string; label: string }> {
  const asset = leadCharacterAsset(subject, assets);
  if (!asset) return [];
  return asset.variants.flatMap((variant) => variant.assetId
    ? [{ value: variant.assetId, label: variant.label }]
    : []);
}
