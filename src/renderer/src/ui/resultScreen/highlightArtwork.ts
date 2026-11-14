import type { PlayerState } from '@shared/models';
import { defaultHeadshotCrop, scoreboardPhotoViewBox, type PhotoBounds } from '@shared/scoreboardPhotos';
import { prepareImage } from '../../imagePreparation';
import { blobDataUrl } from '../../blobDataUrl';
import { api } from '../../api';
import { BoundedPromiseCache } from '../../boundedPromiseCache';
import { readLogoContent } from '../scoreboardPhotos/scoreboardLogoBackdrop';
import { estimatePortraitFocus } from '../scoreboardPhotos/scoreboardPhotoSilhouette';

export type HighlightArtworkFrame = { top: number; aspectRatio: number };
type FramedArtwork = { url: string; frame: HighlightArtworkFrame };
const framedImages = new BoundedPromiseCache<FramedArtwork>(8, {
  maxWeight: 16 * 1024 * 1024,
  weigh: (value, key) => (value.url.length + key.length) * 2
});

/** Size the head from the alpha sample while retaining the torso below it. */
export function frameHighlightArtwork(url: string, kind: 'photo' | 'character'): Promise<FramedArtwork> {
  return framedImages.getOrCreate(`${kind}:${url}`, () =>
    prepareImage(async () => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || width * height > 64_000_000) throw new Error('Invalid artwork dimensions.');
      let focusBounds: PhotoBounds | undefined;
      const contentBounds = readLogoContent(image, (pixels, sampleWidth, sampleHeight) => {
        if (kind === 'photo' || height > width * 1.35) {
          const focus = estimatePortraitFocus(pixels, sampleWidth, sampleHeight);
          if (kind === 'photo' || (focus && focus.width < 0.85)) focusBounds = focus;
        }
      });
      const box = scoreboardPhotoViewBox(
        { width, height, contentBounds, focusBounds, crop: defaultHeadshotCrop(), autoFrame: true },
        focusBounds ? 1.04 : 640 / 900
      );
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 900;
      try {
        const context = canvas.getContext('2d');
        if (!context) return { url, frame: { top: contentBounds.y, aspectRatio: width / height } };
        const focusWidth = focusBounds ? 480 : canvas.width;
        const scale = focusWidth / box.width;
        const x = (canvas.width - focusWidth) / 2 - box.x * scale;
        const y = (focusBounds ? 12 : 0) - box.y * scale;
        context.drawImage(image, x, y, width * scale, height * scale);
        const bounds = focusBounds ?? contentBounds;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('The artwork could not be prepared.');
        return {
          url: await blobDataUrl(blob),
          frame: {
            top: Math.max(0, Math.min(1, (y + bounds.y * height * scale) / canvas.height)),
            aspectRatio: canvas.width / canvas.height
          }
        };
      } finally {
        canvas.width = canvas.height = 0;
      }
    })
  );
}

export async function highlightPlayerPhoto(player: PlayerState, fallbackId?: string) {
  const { photos } = await api.resolveScoreboardPhotos([
    {
      name: player.name,
      playerId: player.playerId,
      localPlayerId: player.localPlayerId,
      playerPhotoAssetId: player.playerPhotoAssetId
    }
  ]);
  const photo = photos[0];
  const assetId = photo?.assetId ?? fallbackId;
  const url =
    photo?.source === 'headshot'
      ? await api.playerHeadshotAssetUrl(photo.assetId, false)
      : assetId
        ? await api.playerPhotoAssetUrl(assetId, false)
        : undefined;
  return { assetId, url };
}
