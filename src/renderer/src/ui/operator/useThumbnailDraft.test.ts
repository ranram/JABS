// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { libraryPresentationSchema } from '@shared/playerLibrary';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { useThumbnailDraft } from './useThumbnailDraft';

const resolvePlayers = vi.hoisted(() => vi.fn());
vi.mock('../../api', () => ({ api: { resolvePlayers } }));
afterEach(() => vi.resetAllMocks());

function savedPlayer(character = 'Ryu', asset = 'ryu-2.png') {
  return libraryPresentationSchema.parse({
    localPlayerId: '1'.padStart(32, '0'),
    playerId: '1',
    name: 'Player One',
    prefix: null,
    sponsor: null,
    xHandle: null,
    pronouns: null,
    country: null,
    state: null,
    displayFlag: null,
    playerPhotoAssetId: null,
    characters: [character],
    character,
    characterAssetId: asset,
    portraitAssetId: `${asset}-portrait`
  });
}

function match(id = 'first') {
  const set = createTestOverlayState('street-fighter-6').selectedSet;
  set.setId = id;
  set.playerOne = {
    ...set.playerOne,
    playerId: '1',
    character: 'Ryu',
    characters: ['Ryu'],
    characterAssetId: undefined
  };
  set.playerTwo = { ...set.playerTwo, playerId: undefined };
  return set;
}

it('keeps outfits within the same game and resolves defaults again for a new match with the same players', async () => {
  resolvePlayers.mockResolvedValue([savedPlayer()]);
  const hook = await mountHook(() => useThumbnailDraft(match()));
  expect(hook.current.draft.players[0].characterAssetId).toBe('ryu-2.png');
  await act(async () => hook.current.setPlayer(0, { characterAssetId: 'ryu-3.png' }));
  await act(async () => hook.current.setGameContext('street-fighter-6', 'Street Fighter 6', 'street-fighter-6'));
  expect(hook.current.draft.players[0].characterAssetId).toBe('ryu-3.png');

  resolvePlayers.mockResolvedValue([savedPlayer('Ryu', 'ryu-4.png')]);
  await act(async () => hook.current.useActiveSet(match('second')));
  expect(hook.current.draft.players[0].characterAssetId).toBe('ryu-4.png');
  const lookups = resolvePlayers.mock.calls.length;
  await act(async () => {
    hook.current.setStyle('spotlight');
    hook.current.setMediaMode('combined');
  });
  expect(resolvePlayers).toHaveBeenCalledTimes(lookups);

  resolvePlayers.mockResolvedValue([savedPlayer('King', 'king-2.png')]);
  await act(async () => hook.current.setGameContext('tekken-8', 'Tekken 8', 'tekken-8'));
  expect(hook.current.draft.players[0]).toMatchObject({ character: 'King', characterAssetId: 'king-2.png' });
});

it('ignores library replies for replaced matches or players edited while the request was pending', async () => {
  const oldMatch = deferred<ReturnType<typeof savedPlayer>[]>();
  const newMatch = deferred<ReturnType<typeof savedPlayer>[]>();
  resolvePlayers.mockReturnValueOnce(oldMatch.promise).mockReturnValue(newMatch.promise);
  const hook = await mountHook(() => useThumbnailDraft(match()));
  await act(async () => hook.current.useActiveSet(match('second')));
  await act(async () => oldMatch.resolve([savedPlayer('Ryu', 'old.png')]));
  expect(hook.current.draft.players[0].characterAssetId).toBeUndefined();
  await act(async () => hook.current.setPlayer(0, { characterAssetId: 'manual.png' }));
  await act(async () => newMatch.resolve([savedPlayer('Ryu', 'new.png')]));
  expect(hook.current.draft.players[0].characterAssetId).toBe('manual.png');
});

it('reimports the same match after the live source has been cleared without following ordinary score edits', async () => {
  resolvePlayers.mockResolvedValue([savedPlayer()]);
  let active: ReturnType<typeof match> | undefined = match();
  const hook = await mountHook(() => useThumbnailDraft(active));
  await act(async () => hook.current.setPlayer(0, { name: 'Manual graphic name' }));
  active = { ...active!, playerOne: { ...active!.playerOne, score: 1 } };
  await hook.rerender();
  expect(hook.current.draft.players[0].name).toBe('Manual graphic name');
  active = undefined;
  await hook.rerender();
  active = match();
  await hook.rerender();
  expect(hook.current.draft.players[0].name).toBe(active.playerOne.name);
  expect(hook.current.draft.players[0].characterAssetId).toBe('ryu-2.png');
});
