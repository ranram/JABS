import { z } from 'zod';
import type { GameCharacterAsset } from './models';
import { playerCharacters } from './characterTeams';
import { artworkFramingSchema } from './artworkFraming';

type CharacterArtworkSubject = {
  character?: string;
  characters?: string[];
  characterAssetId?: string;
  portraitAssetId?: string;
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
  const selected =
    mediaKind === 'portrait' ? (subject.portraitAssetId ?? subject.characterAssetId) : subject.characterAssetId;
  const variantId = mediaKind === 'portrait' ? 'portraitAssetId' : 'assetId';
  if (selected) {
    const selectedVariant = asset.variants.find(
      (variant) => variant.assetId === selected || variant.portraitAssetId === selected
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

export const characterFramingGroupMemberLimit = 64;
const framingAssetId = z.string().min(1).max(255);
const characterFramingGroupSchema = z.object({
  number: z.number().int().positive(),
  anchor: framingAssetId,
  members: z.array(framingAssetId).max(characterFramingGroupMemberLimit),
  useSharedForAdjusted: z.boolean(),
  framingKey: z
    .string()
    .regex(/^@group\/\d+$/)
    .optional(),
  framingSnapshot: artworkFramingSchema.optional()
});
export const characterFramingGroupsResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  framingGroups: z.array(characterFramingGroupSchema).max(512)
});
export const gameCharacterAssetsResponseSchema = z.object({
  assets: z.array(
    z.object({
      character: z.string(),
      assetId: z.string().optional(),
      portraitAssetId: z.string().optional(),
      variants: z.array(
        z.object({ label: z.string(), assetId: z.string().optional(), portraitAssetId: z.string().optional() })
      )
    })
  ),
  framingGroups: z.array(characterFramingGroupSchema).max(512).optional()
});
export type CharacterFramingGroup = z.infer<typeof characterFramingGroupSchema>;
export type CharacterFramingGroupEdit = Pick<CharacterFramingGroup, 'anchor' | 'members' | 'useSharedForAdjusted'> & {
  number?: number;
};

export function characterFramingGroup(assetId: string | undefined, groups: readonly CharacterFramingGroup[] = []) {
  if (assetId === undefined) return undefined;
  return groups.find(({ anchor, members }) => anchor === assetId || members.includes(assetId));
}
