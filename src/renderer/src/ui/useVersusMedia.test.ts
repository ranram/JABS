// @vitest-environment happy-dom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { deferred, mountHook } from '../hooks/hookTestHarness';
import { useVersusMedia } from './useVersusMedia';

const transport = vi.hoisted(() => ({
  artwork: vi.fn(async (_slug: string, id: string) => `art:${id}`),
  identity: vi.fn(async () => ({ matches: [{ playerPhotoAssetId: 'one.webp' }, { playerPhotoAssetId: 'two.webp' }] }))
}));
vi.mock('../api', () => ({
  api: {
    identityMedia: transport.identity,
    gameCharacterAssets: async () => ({
      assets: [
        { character: 'Cammy', assetId: 'Cammy.webp', variants: [] },
        { character: 'Ryu', assetId: 'Ryu.webp', variants: [] }
      ]
    }),
    gameCharacterAssetUrl: transport.artwork,
    playerPhotoAssetUrl: async (id: string) => `photo:${id}`
  }
}));

it('keeps the other player artwork visible while a newly selected character loads', async () => {
  const selected = createTestOverlayState().selectedSet;
  selected.playerOne.character = undefined;
  selected.playerOne.characters = [];
  selected.playerTwo.character = 'Ryu';
  selected.playerTwo.characters = ['Ryu'];
  const hook = await mountHook(() => useVersusMedia(selected));
  expect(hook.current.ready).toBe(true);
  const otherPlayer = hook.current.media[1];
  expect(otherPlayer.characterUrl).toBe('art:Ryu.webp');
  expect(otherPlayer.photoUrl).toBe('photo:two.webp');

  const pending = deferred<string>();
  transport.artwork.mockImplementation(async (_slug, id) => (id === 'Cammy.webp' ? pending.promise : `art:${id}`));
  selected.playerOne.character = 'Cammy';
  selected.playerOne.characters = ['Cammy'];
  await hook.rerender();
  expect(hook.current.ready).toBe(false);
  expect(hook.current.media[1]).toBe(otherPlayer);
  await act(async () => pending.resolve('art:Cammy.webp'));
  expect(hook.current.ready).toBe(true);
  expect(hook.current.media[0].characterUrl).toBe('art:Cammy.webp');
  expect(hook.current.media[1]).toEqual(otherPlayer);
  expect(transport.identity).toHaveBeenCalledOnce();
  transport.artwork.mockRejectedValueOnce(new Error('Artwork missing'));
  selected.playerOne.character = 'Ryu';
  selected.playerOne.characters = ['Ryu'];
  await hook.rerender();
  expect(hook.current.ready).toBe(true);
  expect(hook.current.media[0].photoUrl).toBe('photo:one.webp');
  expect(hook.current.media[0].characterUrl).toBeUndefined();
  expect(hook.current.media[1]).toEqual(otherPlayer);
  expect(transport.identity).toHaveBeenCalledOnce();
  await hook.unmount();
});
