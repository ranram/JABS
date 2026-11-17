// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createThumbnailDraft } from '@shared/thumbnail';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { useGeneratorMedia } from './useGeneratorMedia';
import { useCharacterCatalogOptions } from './useCharacterCatalogOptions';

const transport = vi.hoisted(() => ({
  catalog: vi.fn(),
  artwork: vi.fn(),
  identities: vi.fn(),
  photo: vi.fn(async (id: string) => `photo:${id}`),
  sponsor: vi.fn(async (id: string) => `sponsor:${id}`)
}));
vi.mock('../../api', () => ({
  api: {
    gameCharacterAssets: transport.catalog,
    gameCharacterAssetUrl: transport.artwork,
    identityMedia: transport.identities,
    playerPhotoAssetUrl: transport.photo,
    sponsorLogoAssetUrl: transport.sponsor
  }
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it('loads named players beside empty slots and keeps their photos when a sponsor image fails', async () => {
  vi.useFakeTimers();
  transport.catalog.mockResolvedValue({ assets: [] });
  transport.identities.mockImplementation(async (identities: Array<{ name: string; sponsor?: string }>) => ({
    matches: identities.map(({ name, sponsor }) => ({ playerPhotoAssetId: name, sponsorLogoAssetId: sponsor }))
  }));
  transport.sponsor.mockRejectedValue(new Error('Sponsor image unavailable'));
  let draft = createThumbnailDraft();
  draft.players = [{ name: '' }, { name: 'Second', sponsor: 'Team' }];
  const hook = await mountHook(() =>
    useGeneratorMedia({
      draft,
      subjects: draft.players,
      assetCatalogSlug: draft.assetCatalogSlug,
      assetCatalogRevision: 0,
      context: {}
    })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(transport.identities).toHaveBeenLastCalledWith([{ name: 'Second', sponsor: 'Team' }], {});
  expect(hook.current.ready).toBe(true);
  expect(hook.current.media.map(({ playerPhotoUrl }) => playerPhotoUrl)).toEqual([undefined, 'photo:Second']);
  expect(hook.current.media[1].sponsorLogoUrl).toBeUndefined();

  transport.sponsor.mockResolvedValue('sponsor:restored');
  draft = { ...draft, players: [{ name: 'First' }, draft.players[1]] };
  await hook.rerender();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(hook.current.ready).toBe(true);
  expect(hook.current.media.map(({ playerPhotoUrl }) => playerPhotoUrl)).toEqual(['photo:First', 'photo:Second']);
  expect(hook.current.media[1].sponsorLogoUrl).toBe('sponsor:restored');

  const lookups = transport.identities.mock.calls.length;
  draft = { ...draft, players: [{ name: '' }, { name: ' ' }] };
  await hook.rerender();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(hook.current.ready).toBe(true);
  expect(hook.current.media.every(({ playerPhotoUrl, sponsorLogoUrl }) => !playerPhotoUrl && !sponsorLogoUrl)).toBe(
    true
  );
  expect(transport.identities).toHaveBeenCalledTimes(lookups);
});

it('keeps character choices while checking replacements and hides them when changing games', async () => {
  const original = [{ character: 'Ryu', assetId: 'ryu.png', variants: [] }];
  transport.catalog.mockResolvedValue({ assets: original });
  let revision = 0;
  let slug = 'street-fighter-6';
  const view = await mountHook(() => useCharacterCatalogOptions(slug, revision));
  expect(view.current.assets).toEqual(original);
  const replacement = deferred<{ assets: typeof original }>();
  transport.catalog.mockReturnValue(replacement.promise);
  revision++;
  await view.rerender();
  expect(view.current.assets).toEqual(original);
  await act(async () => replacement.resolve({ assets: [{ ...original[0], assetId: 'ryu-new.png' }] }));
  expect(view.current.assets[0]?.assetId).toBe('ryu-new.png');
  slug = 'tekken-8';
  transport.catalog.mockRejectedValue(new Error('Unavailable'));
  await view.rerender();
  expect(view.current.assets).toEqual([]);
});

it.each([
  { first: 'artwork', scenario: 'player change' },
  { first: 'identity', scenario: 'player change' },
  { first: 'identity', scenario: 'asset reload' }
])('keeps media together during $scenario when $first finishes first', async ({ first, scenario }) => {
  vi.useFakeTimers();
  transport.catalog.mockResolvedValue({
    assets: [
      { character: 'Ryu', assetId: 'ryu.png', variants: [] },
      { character: 'Ken', assetId: 'ken.png', variants: [] }
    ]
  });
  transport.artwork.mockResolvedValue('art:ryu');
  transport.identities.mockResolvedValue({ matches: [{ playerPhotoAssetId: 'first' }, {}] });
  let draft = createThumbnailDraft();
  let revision = 0;
  draft.players[0] = { name: 'First player', character: 'Ryu' };
  const hook = await mountHook(() =>
    useGeneratorMedia({
      draft,
      subjects: draft.players,
      assetCatalogSlug: draft.assetCatalogSlug,
      assetCatalogRevision: revision,
      context: { tournamentName: draft.tournamentName }
    })
  );
  expect(hook.current.ready).toBe(false);
  expect(hook.current.refreshing).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(hook.current.ready).toBe(true);

  const artwork = deferred<string>();
  const identity = deferred<{ matches: Array<{ playerPhotoAssetId?: string }> }>();
  transport.artwork.mockReturnValue(artwork.promise);
  transport.identities.mockReturnValue(identity.promise);
  if (scenario === 'asset reload') revision += 1;
  else draft = { ...draft, players: [{ name: 'Second player', character: 'Ken' }, draft.players[1]] };
  await hook.rerender();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  const finishArtwork = () => artwork.resolve('art:ken');
  const finishIdentity = () => identity.resolve({ matches: [{ playerPhotoAssetId: 'second' }, {}] });
  await act(async () => {
    (first === 'artwork' ? finishArtwork : finishIdentity)();
  });
  expect(hook.current.ready).toBe(false);
  expect(hook.current.refreshing).toBe(scenario === 'asset reload');
  expect(hook.current.previewDraft.players[0].name).toBe('First player');
  expect(hook.current.media[0]).toMatchObject({ characterUrl: 'art:ryu', playerPhotoUrl: 'photo:first' });

  await act(async () => {
    (first === 'artwork' ? finishIdentity : finishArtwork)();
  });
  expect(hook.current.ready).toBe(true);
  expect(hook.current.previewDraft.players[0].name).toBe(
    scenario === 'asset reload' ? 'First player' : 'Second player'
  );
  expect(hook.current.media[0]).toMatchObject({ characterUrl: 'art:ken', playerPhotoUrl: 'photo:second' });
});

it('keeps failed refreshes coherent, clears confirmed missing media, and recovers after files are restored', async () => {
  vi.useFakeTimers();
  const assets = [{ character: 'Ryu', assetId: 'ryu.png', variants: [] }];
  transport.catalog.mockResolvedValue({ assets });
  transport.artwork.mockResolvedValue('art:first');
  transport.identities.mockResolvedValue({ matches: [{}, {}] });
  const draft = createThumbnailDraft();
  draft.players[0] = { name: 'Player One', character: 'Ryu', playerPhotoAssetId: 'portrait.png' };
  let revision = 0;
  const hook = await mountHook(() =>
    useGeneratorMedia({
      draft,
      subjects: draft.players,
      assetCatalogSlug: draft.assetCatalogSlug,
      assetCatalogRevision: revision,
      context: {}
    })
  );
  const reload = async () => {
    revision += 1;
    await hook.rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(hook.current.ready).toBe(true);
  transport.artwork.mockRejectedValue(new Error('Image disappeared during reload'));
  transport.photo.mockRejectedValue(new Error('Photo unavailable'));
  await reload();
  expect(hook.current.ready).toBe(false);
  expect(hook.current.media[0]).toMatchObject({ characterUrl: 'art:first', playerPhotoUrl: 'photo:portrait.png' });
  expect(hook.current.warning?.message).toBe('Image disappeared during reload');

  transport.catalog.mockResolvedValue({ assets: [{ character: 'Ryu', variants: [] }] });
  await reload();
  expect(hook.current.ready).toBe(true);
  expect(hook.current.media[0].characterUrl).toBeUndefined();
  expect(hook.current.media[0].playerPhotoUrl).toBeUndefined();
  expect(hook.current.warning).toBeUndefined();

  transport.catalog.mockResolvedValue({ assets });
  transport.artwork.mockResolvedValue('art:restored');
  transport.photo.mockResolvedValue('photo:restored');
  await reload();
  expect(hook.current.ready).toBe(true);
  expect(hook.current.media[0]).toMatchObject({ characterUrl: 'art:restored', playerPhotoUrl: 'photo:restored' });
});
