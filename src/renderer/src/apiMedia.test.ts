// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { api, invalidateCatalogRasterCache } from './api';
import { trimTransparentPadding } from './trimTransparentPadding';

vi.mock('./trimTransparentPadding', () => ({
  trimTransparentPadding: vi.fn(async (source: string) => `${source}#trimmed`)
}));

afterEach(() => {
  invalidateCatalogRasterCache({ recheckGameFolders: false });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('shares prepared artwork across consumers and prepares replaced assets again after reload', async () => {
  const fetchImage = vi.fn(async () => ({
    ok: true,
    headers: new Headers({ 'content-type': 'image/png' }),
    blob: async () => new Blob(['artwork'], { type: 'image/png' })
  }));
  vi.stubGlobal('fetch', fetchImage);
  const loaders = [
    () => api.gameCharacterAssetUrl('street-fighter-6', 'Ryu5.png'),
    () => api.gameCharacterPortraitUrl('street-fighter-6', 'Cammy4.png'),
    () => api.playerPhotoAssetUrl('player.png'),
    () => api.playerHeadshotAssetUrl('headshot.png')
  ];
  for (const load of loaders) {
    const [overlay, preview] = await Promise.all([load(), load()]);
    expect(overlay).toMatch(/#trimmed$/);
    expect(preview).toBe(overlay);
  }
  expect(fetchImage).toHaveBeenCalledTimes(4);
  expect(trimTransparentPadding).toHaveBeenCalledTimes(4);

  invalidateCatalogRasterCache({ recheckGameFolders: false });
  await loaders[0]();
  expect(fetchImage).toHaveBeenCalledTimes(5);
  expect(trimTransparentPadding).toHaveBeenCalledTimes(5);
});

it('keeps the original player image separate from its trimmed display copy', async () => {
  const fetchImage = vi.fn(async () => ({
    ok: true,
    headers: new Headers({ 'content-type': 'image/png' }),
    blob: async () => new Blob(['photo'], { type: 'image/png' })
  }));
  vi.stubGlobal('fetch', fetchImage);

  const source = await api.playerPhotoAssetUrl('player.png', false);
  const trimmed = await api.playerPhotoAssetUrl('player.png');

  expect(source).not.toMatch(/#trimmed$/);
  expect(trimmed).toMatch(/#trimmed$/);
  expect(fetchImage).toHaveBeenCalledTimes(2);
  expect(trimTransparentPadding).toHaveBeenCalledTimes(1);
});
