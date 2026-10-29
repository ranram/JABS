import { utf16AtMost } from './schemaText';
import { z } from 'zod';
import { canonicalGameId, gameIdForStartggVideogame, gameProfiles } from './gameProfiles';
import type { SelectedSetState } from './models';
import layouts from './scoreboardPhotoLayouts.json';
import { defaultMediaTransform, mediaTransformSchema, type MediaTransform } from './mediaPlacement';

const gamePlacementsSchema = z.record(
  // Saved framing remains readable when a game's photo layout is retired.
  z.string().refine((id) => Object.hasOwn(gameProfiles, id)),
  z.object({ left: mediaTransformSchema.optional(), right: mediaTransformSchema.optional() }).strict()
);

export const headshotCropSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    zoom: z.number().finite().min(1).max(5)
  })
  .strict();
export const scoreboardPhotoSchema = z
  .object({
    source: z.enum(['headshot', 'photo']),
    assetId: z
      .string()
      .min(1)
      .refine(utf16AtMost(255))
      .refine((s) => !s.includes('/') && !s.includes('\\') && !s.includes('\0') && s !== '..'),
    fingerprint: z.string().regex(/^[a-f0-9]{16}$/),
    crop: headshotCropSchema,
    placements: gamePlacementsSchema.optional()
  })
  .strict();
export type ScoreboardPhoto = z.infer<typeof scoreboardPhotoSchema>;
export type HeadshotCrop = z.infer<typeof headshotCropSchema>;
export const defaultHeadshotCrop = (): HeadshotCrop => ({ x: 0.5, y: 0.35, zoom: 1 });
export const scoreboardPhotoSettingsSchema = z
  .object({
    enabled: z.boolean(),
    logoBackdrop: z.boolean().default(false),
    sponsorBackdrop: z.boolean().default(false),
    updatedAt: z.string()
  })
  .strict()
  .refine((settings) => !(settings.logoBackdrop && settings.sponsorBackdrop), 'Choose only one logo backdrop.');
export type ScoreboardPhotoSettings = z.infer<typeof scoreboardPhotoSettingsSchema>;
export const resolvedScoreboardPhotosSchema = z.object({ photos: z.array(scoreboardPhotoSchema.nullable()).max(2) });
export type ScoreboardPhotoIdentity = {
  localPlayerId?: string;
  playerId?: string;
  name: string;
  playerPhotoAssetId?: string;
};

export type PhotoShape = { path: string; bounds: number[]; transform?: string };
export type PhotoProtectedArea = { bounds: number[]; shape?: string };
export type ScoreboardPhotoLayout = {
  gameId?: string;
  maskId: string;
  sides: { left: PhotoShape; right: PhotoShape };
  protectedAreas: PhotoProtectedArea[];
};
const photoLayouts: Record<string, ScoreboardPhotoLayout> = layouts;

export function scoreboardPhotoLayout(
  set: Pick<SelectedSetState, 'gameId' | 'assetCatalogSlug' | 'gameName' | 'videogameId'>
) {
  const fromName = (name?: string) =>
    name ? gameIdForStartggVideogame({ id: set.videogameId ?? '', name }) : undefined;
  const id = set.assetCatalogSlug
    ? (canonicalGameId(set.assetCatalogSlug) ??
      fromName(set.assetCatalogSlug.replaceAll('-', ' ')) ??
      fromName(set.gameName))
    : set.gameName
      ? fromName(set.gameName)
      : canonicalGameId(set.gameId);
  const layout = id ? photoLayouts[id] : undefined;
  return layout ? { ...layout, gameId: id } : undefined;
}

export function scoreboardPhotoPlacement(
  photo: ScoreboardPhoto,
  gameId: string | undefined,
  side: 'left' | 'right'
): MediaTransform {
  return (gameId && photo.placements?.[gameId]?.[side]) || defaultMediaTransform();
}

export function photoPlacementTransform(box: ReturnType<typeof photoCropViewBox>, placement: MediaTransform) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return `translate(${cx + (placement.x * box.width) / 2} ${cy + placement.y * box.height}) scale(${placement.scale * (placement.flipped ? -1 : 1)} ${placement.scale}) translate(${-cx} ${-cy})`;
}

export function photoCropViewBox(width: number, height: number, aspect: number, crop: HeadshotCrop) {
  const w = Math.min(width, height * aspect) / crop.zoom;
  const h = w / aspect;
  return {
    x: Math.max(0, (width - w) / 2) + (crop.x - 0.5) * width,
    y: Math.max(0, Math.min(height - h, height * 0.35 - h / 2)) + (crop.y - 0.35) * height,
    width: w,
    height: h
  };
}
