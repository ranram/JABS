import type { CharacterFramingGroup } from './characterAssets';
import { z } from 'zod';
import type { PlayerState, SelectedSetState } from './models';
import { playerCharacters } from './characterTeams';
import {
  defaultCharacterTransform,
  defaultMediaTransform,
  type MediaLayerKind,
  type MediaTransform
} from './mediaPlacement';

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
  assets?: { characterAssetId?: string; photoAssetId?: string; framingGroup?: CharacterFramingGroup },
  side: 0 | 1 = 0,
  framing?: ArtworkFraming,
  mirrorCharacterPlacement?: boolean
) {
  const mirrorX = !['classic', 'victory', 'spotlight'].includes(layout.split(':')[0]!);
  const game = set.assetCatalogSlug ?? set.gameId;
  const exactAsset = assets?.characterAssetId ?? player.characterAssetId ?? 'default';
  const characterName = playerCharacters(player)[0];
  const characterKey = (playerSide: 0 | 1, mirrored = mirrorCharacterPlacement === true, asset = exactAsset) =>
    JSON.stringify([
      layout,
      game,
      'character',
      characterName,
      asset,
      ...(mirrored ? ['mirrored'] : []),
      ...(playerSide === 1 ? [1] : [])
    ]);
  const group = assets?.framingGroup;
  const sharedGroup =
    group && (group.useSharedForAdjusted || (!framing?.[characterKey(0)] && !framing?.[characterKey(1)]))
      ? group
      : undefined;
  const sharedAsset = sharedGroup?.framingKey ?? sharedGroup?.anchor ?? exactAsset;
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
    character: characterKey(side, undefined, sharedAsset),
    mirroredCharacter: characterKey(side === 0 ? 1 : 0, undefined, sharedAsset),
    exactCharacter: characterKey(side),
    exactOppositeCharacter: characterKey(side === 0 ? 1 : 0),
    grouped: Boolean(group),
    framingSnapshot: sharedGroup?.framingSnapshot,
    manualCharacters: mirrorCharacterPlacement
      ? ([characterKey(0, false, sharedAsset), characterKey(1, false, sharedAsset)] as const)
      : undefined,
    mirrorCharacterPlacement,
    side,
    photo: photoKey(photoIdentity, side),
    previousPhotos,
    mirrorX
  };
}

export function artworkPlacement(framing: ArtworkFraming, keys: ReturnType<typeof artworkFramingKeys>) {
  const direction = keys.mirrorX ? -1 : 1;
  function characterPosition(key: string) {
    return framing[key] ?? keys.framingSnapshot?.[key];
  }
  const opposite = keys.mirrorCharacterPlacement === false ? undefined : characterPosition(keys.mirroredCharacter);
  const manualLeft = keys.manualCharacters && characterPosition(keys.manualCharacters[0]);
  const manualRight = keys.manualCharacters && characterPosition(keys.manualCharacters[1]);
  const manual = manualLeft ?? manualRight;
  const reflect = (value: MediaTransform) => ({
    ...value,
    x: direction * value.x,
    flipped: keys.mirrorCharacterPlacement ? !value.flipped : false
  });
  const previousPhoto = keys.previousPhotos.find(({ key }) => framing[key]);
  const photo = previousPhoto ? framing[previousPhoto.key] : undefined;
  const saved = characterPosition(keys.character);
  const defaultCharacter = defaultCharacterTransform(keys.side, keys.mirrorCharacterPlacement);
  const character =
    saved ??
    (opposite ? reflect(opposite) : undefined) ??
    (manual ? (keys.side === (manualLeft ? 0 : 1) ? manual : reflect(manual)) : defaultCharacter);
  const exactFlip = framing[keys.exactCharacter]?.flipped;
  const mirroredByDefault = defaultCharacter.flipped;
  const sharedFlip =
    mirroredByDefault &&
    keys.character === keys.exactCharacter &&
    exactFlip === false &&
    !framing[keys.exactOppositeCharacter]?.flipped
      ? undefined
      : exactFlip;
  const facing = keys.grouped
    ? (sharedFlip ?? mirroredByDefault)
    : keys.mirrorCharacterPlacement && !saved && !opposite
      ? mirroredByDefault
      : character.flipped;
  const flipped = framing[flipKey(keys.exactCharacter)]?.flipped ?? facing;
  return {
    character: { ...character, flipped },
    photo:
      framing[keys.photo] ??
      (photo ? { ...photo, x: previousPhoto?.mirrored ? direction * photo.x : photo.x } : defaultMediaTransform())
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

function flipKey(key: string) {
  return `${key}:flip`;
}

export function updateArtworkPlacement(
  framing: ArtworkFraming,
  keys: ReturnType<typeof artworkFramingKeys>,
  layer: MediaLayerKind,
  transform: MediaTransform
): ArtworkFraming {
  if (layer === 'photo') return { ...framing, [keys.photo]: transform };

  const previous = artworkPlacement(framing, keys).character;
  const moved = previous.x !== transform.x || previous.y !== transform.y || previous.scale !== transform.scale;
  const next = { ...framing };
  if (keys.grouped && previous.flipped !== transform.flipped) {
    next[flipKey(keys.exactCharacter)] = { ...defaultMediaTransform(), flipped: transform.flipped };
  }
  if (keys.grouped && !moved) return next;

  next[keys.character] = {
    ...transform,
    flipped: keys.grouped
      ? (framing[keys.character]?.flipped ??
        defaultCharacterTransform(keys.side, keys.mirrorCharacterPlacement).flipped)
      : transform.flipped
  };
  const reflectFlip = !keys.grouped && keys.mirrorCharacterPlacement === true;
  if (keys.mirrorCharacterPlacement !== false && (reflectFlip || moved)) {
    next[keys.mirroredCharacter] = {
      ...transform,
      x: keys.mirrorX ? -transform.x : transform.x,
      flipped: reflectFlip
        ? !transform.flipped
        : (framing[keys.mirroredCharacter]?.flipped ??
          defaultCharacterTransform(keys.side === 0 ? 1 : 0, keys.mirrorCharacterPlacement).flipped)
    };
    if (reflectFlip) delete next[flipKey(keys.mirroredCharacter)];
  }
  if (!keys.grouped) delete next[flipKey(keys.exactCharacter)];
  return next;
}

export function artworkFramingLayout(layout: string, characterVisible: boolean, photoVisible: boolean): string {
  if (characterVisible && photoVisible) return layout;
  return `${layout}:${characterVisible ? 'character' : photoVisible ? 'photo' : 'none'}`;
}
