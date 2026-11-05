import { z } from 'zod';
import type { PlayerState, SelectedSetState } from './models';
import { playerCharacters } from './characterTeams';
import { defaultMediaTransform, type MediaTransform } from './mediaPlacement';

export const artworkTransformSchema = z.object({
  x: z.number().finite().min(-2).max(2),
  y: z.number().finite().min(-2).max(2),
  scale: z.number().finite().min(0.1).max(8),
  flipped: z.boolean().default(false)
});
export const artworkFramingSchema = z
  .record(z.string().max(1024), artworkTransformSchema)
  .refine((entries) => Object.keys(entries).length <= 2048);
export type ArtworkFraming = Record<string, MediaTransform>;

export function artworkFramingKeys(
  set: SelectedSetState,
  player: PlayerState,
  layout: string,
  assets?: { characterAssetId?: string; photoAssetId?: string },
  side: 0 | 1 = 0
) {
  const game = set.assetCatalogSlug ?? set.gameId;
  const character = [
    layout,
    game,
    'character',
    playerCharacters(player)[0],
    assets?.characterAssetId ?? player.characterAssetId ?? 'default'
  ];
  const photoIdentity = player.playerId || player.localPlayerId || player.name;
  const photoAsset = assets?.photoAssetId ?? player.playerPhotoAssetId ?? player.name;
  const photoKey = (identity: string, playerSide: 0 | 1) =>
    JSON.stringify([layout, game, 'photo', identity, photoAsset, ...(playerSide === 1 ? [1] : [])]);
  const previousPhotos: Array<{ key: string; mirrored: boolean }> = [];
  // Older saves used local IDs and did not distinguish the second photo's side.
  if (player.playerId && player.localPlayerId) {
    previousPhotos.push({ key: photoKey(player.localPlayerId, side), mirrored: false });
    if (side === 1) previousPhotos.push({ key: photoKey(player.localPlayerId, 0), mirrored: true });
  }
  if (side === 1) previousPhotos.push({ key: photoKey(photoIdentity, 0), mirrored: true });
  return {
    character: JSON.stringify(side === 0 ? character : [...character, 1]),
    mirroredCharacter: JSON.stringify(side === 1 ? character : [...character, 1]),
    photo: photoKey(photoIdentity, side),
    previousPhotos
  };
}

export function artworkPlacement(framing: ArtworkFraming, keys: ReturnType<typeof artworkFramingKeys>) {
  const opposite = framing[keys.mirroredCharacter];
  const previousPhoto = keys.previousPhotos.find(({ key }) => framing[key]);
  const photo = previousPhoto ? framing[previousPhoto.key] : undefined;
  return {
    character:
      framing[keys.character] ?? (opposite ? { ...opposite, x: -opposite.x, flipped: false } : defaultMediaTransform()),
    photo:
      framing[keys.photo] ??
      (photo ? { ...photo, x: previousPhoto?.mirrored ? -photo.x : photo.x } : defaultMediaTransform())
  };
}

export function clampArtworkTransform(transform: MediaTransform): MediaTransform {
  return {
    ...transform,
    x: Math.max(-2, Math.min(2, transform.x)),
    y: Math.max(-2, Math.min(2, transform.y)),
    scale: Math.max(0.1, Math.min(8, transform.scale))
  };
}

export function updateArtworkFraming(
  framing: ArtworkFraming,
  key: string,
  transform: MediaTransform,
  mirroredKey?: string
): ArtworkFraming {
  const next = { ...framing, [key]: transform };
  const opposite = mirroredKey ? framing[mirroredKey] : undefined;
  const previous =
    framing[key] ?? (opposite ? { ...opposite, x: -opposite.x, flipped: false } : defaultMediaTransform());
  if (mirroredKey && (previous.x !== transform.x || previous.y !== transform.y || previous.scale !== transform.scale)) {
    next[mirroredKey] = { ...transform, x: -transform.x, flipped: framing[mirroredKey]?.flipped ?? false };
  }
  return next;
}

export function artworkFramingLayout(layout: string, characterVisible: boolean, photoVisible: boolean): string {
  if (characterVisible && photoVisible) return layout;
  return `${layout}:${characterVisible ? 'character' : photoVisible ? 'photo' : 'none'}`;
}
