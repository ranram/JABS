// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { api, acceptCatalogMessage } from './api';

afterEach(() => vi.unstubAllGlobals());

it('keeps images cached across player edits and skips pixel processing for opaque JPEGs', async () => {
  const fetcher = vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
    headers: { 'Content-Type': 'image/jpeg' }
  }));
  vi.stubGlobal('fetch', fetcher);
  const decode = vi.fn();
  vi.stubGlobal('Image', class { decode = decode; });
  const first = await api.playerPhotoAssetUrl('cached-opaque.jpg');
  acceptCatalogMessage(JSON.stringify({ event: 'player-library', revision: 987 }));
  expect(await api.playerPhotoAssetUrl('cached-opaque.jpg')).toBe(first);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(decode).not.toHaveBeenCalled();
  acceptCatalogMessage(JSON.stringify({ event: 'asset-catalog', revision: 988 }));
  await api.playerPhotoAssetUrl('cached-opaque.jpg');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
