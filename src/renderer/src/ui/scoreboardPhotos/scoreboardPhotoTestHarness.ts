import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import {
  defaultHeadshotCrop,
  type PhotoFraming,
  type ScoreboardPhoto,
  type ScoreboardPhotoSettings
} from '@shared/scoreboardPhotos';
import { initializeI18n } from '../../i18n';

const transport = vi.hoisted(() => ({
  enabled: false,
  framing: 'contained' as PhotoFraming,
  logoBackdrop: false,
  sponsorBackdrop: false,
  showCharacterNames: false,
  updatedAt: '1',
  save: vi.fn(),
  resolve: vi.fn(),
  headshot: vi.fn(),
  photo: vi.fn(),
  identity: vi.fn(),
  sponsor: vi.fn()
}));
vi.mock('../../hooks/useScoreboardPhotos', () => ({
  useScoreboardPhotos: () => ({
    state: {
      enabled: transport.enabled,
      framing: transport.framing,
      logoBackdrop: transport.logoBackdrop,
      sponsorBackdrop: transport.sponsorBackdrop,
      showCharacterNames: transport.showCharacterNames,
      updatedAt: transport.updatedAt
    },
    setState(next: ScoreboardPhotoSettings) {
      transport.enabled = next.enabled;
      transport.framing = next.framing;
      transport.logoBackdrop = next.logoBackdrop;
      transport.sponsorBackdrop = next.sponsorBackdrop;
      transport.showCharacterNames = next.showCharacterNames;
      transport.updatedAt = next.updatedAt;
    }
  })
}));
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      updateScoreboardPhotoSettings: transport.save,
      resolveScoreboardPhotos: transport.resolve,
      playerHeadshotAssetUrl: transport.headshot,
      playerPhotoAssetUrl: transport.photo,
      identityMedia: transport.identity,
      sponsorLogoAssetUrl: transport.sponsor
    }
  };
});
export function photo(id: string): ScoreboardPhoto {
  return { source: 'headshot', assetId: `${id}.png`, fingerprint: '1234567890abcdef', crop: defaultHeadshotCrop() };
}
beforeAll(initializeI18n);
beforeEach(() => {
  transport.enabled = false;
  transport.framing = 'contained';
  transport.logoBackdrop = false;
  transport.sponsorBackdrop = false;
  transport.showCharacterNames = false;
  transport.updatedAt = '1';
  transport.save.mockReset().mockImplementation(async (settings) => ({ ...settings, updatedAt: '2' }));
  transport.resolve.mockReset().mockResolvedValue({ photos: [null, null] });
  transport.headshot.mockReset().mockImplementation(async (id: string) => `data:image/png;base64,${id}`);
  transport.photo.mockReset().mockImplementation(async (id: string) => `data:image/png;base64,${id}`);
  transport.identity.mockReset().mockResolvedValue({
    matches: [{ sponsorLogoAssetId: 'one-square-logo.png' }, { sponsorLogoAssetId: 'two-wide-logo.png' }]
  });
  transport.sponsor.mockReset().mockImplementation(async (id: string) => `data:image/png;base64,${id}`);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      get naturalWidth() {
        return this.src.includes('padded-logo') ? 1080 : 600;
      }
      get naturalHeight() {
        if (this.src.includes('padded-logo')) return 1080;
        if (this.src.includes('square-logo')) return 600;
        if (this.src.includes('wide-')) return 200;
        return 900;
      }
      async decode() {
        if (this.src.includes('broken')) throw new Error('Bad image');
      }
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    let padded = false;
    let silhouette = false;
    return {
      drawImage(image: HTMLImageElement) {
        padded = image.src.includes('padded-logo');
        silhouette = image.src.includes('silhouette');
      },
      getImageData(_x: number, _y: number, width: number, height: number) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (silhouette) {
              const head = x >= width * 0.45 && x < width * 0.65 && y >= height * 0.04 && y < height * 0.28;
              const neck = x >= width * 0.48 && x < width * 0.62 && y >= height * 0.26 && y < height * 0.35;
              const body = x >= width * 0.15 && x < width * 0.9 && y >= height * 0.33;
              if (head || neck || body) data[(y * width + x) * 4 + 3] = 255;
              continue;
            }
            if (!padded || (x >= 47 && x < 215 && y >= 5 && y < 248)) data[(y * width + x) * 4 + 3] = 255;
          }
        }
        return { data };
      }
    } as unknown as CanvasRenderingContext2D;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

export function photoTransport() {
  return transport;
}
