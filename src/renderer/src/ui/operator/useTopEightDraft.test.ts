// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { StartggEventStandingsResult } from '@shared/models';
import { conventionalTopEightPlacements } from '@shared/topEight';
import { libraryPresentationSchema } from '@shared/playerLibrary';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { useTopEightDraft } from './useTopEightDraft';

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

function standings(event = 'first', character?: string): StartggEventStandingsResult {
  return {
    eventName: event,
    eventUrl: `https://start.gg/tournament/example/event/${event}`,
    finalized: true,
    standings: conventionalTopEightPlacements.map((placement, index) => ({
      playerId: index === 0 ? '1' : undefined,
      placement,
      name: `Player ${index + 1}`,
      character: index === 0 ? character : undefined,
      isFinal: true
    }))
  };
}

it('fills imported outfits from the library and preserves edits when another event is loaded', async () => {
  resolvePlayers.mockResolvedValue([savedPlayer()]);
  const hook = await mountHook(() => useTopEightDraft('street-fighter-6'));
  await act(async () => hook.current.useFinalStandings(standings('first', 'Ryu')));
  expect(hook.current.draft.entrants[0]).toMatchObject({
    character: 'Ryu',
    characterAssetId: 'ryu-2.png',
    portraitAssetId: 'ryu-2.png-portrait'
  });
  const lookupsAfterFirstEvent = resolvePlayers.mock.calls.length;

  await act(async () => hook.current.setEntrant(0, { characterAssetId: 'ryu-3.png' }));
  await act(async () => {
    hook.current.setGameContext('street-fighter-6', 'Street Fighter 6', 'street-fighter-6');
    hook.current.useFinalStandings(standings('second'));
  });
  expect(hook.current.draft.entrants[0]).toMatchObject({
    character: 'Ryu',
    characterAssetId: 'ryu-3.png',
    portraitAssetId: 'ryu-2.png-portrait'
  });
  expect(resolvePlayers).toHaveBeenCalledTimes(lookupsAfterFirstEvent + 1);
  await act(async () => {
    hook.current.setMediaMode('combined');
    hook.current.setHeadlineColor('#ff0000');
  });
  expect(resolvePlayers).toHaveBeenCalledTimes(lookupsAfterFirstEvent + 1);

  await act(async () => hook.current.useFinalStandings(standings('third', 'Ken')));
  expect(hook.current.draft.entrants[0]).toMatchObject({ character: 'Ken' });
  expect(hook.current.draft.entrants[0]?.characterAssetId).toBeUndefined();
  expect(hook.current.draft.entrants[0]?.portraitAssetId).toBeUndefined();
});

it('loads the new game defaults and ignores library replies that arrive after an artwork edit', async () => {
  resolvePlayers.mockResolvedValue([savedPlayer()]);
  const hook = await mountHook(() => useTopEightDraft('street-fighter-6'));
  await act(async () => hook.current.useFinalStandings(standings()));
  resolvePlayers.mockResolvedValue([savedPlayer('King', 'king-2.png')]);
  await act(async () => hook.current.setGameContext('tekken-8', 'Tekken 8', 'tekken-8'));
  expect(hook.current.draft.entrants[0]).toMatchObject({ character: 'King', characterAssetId: 'king-2.png' });
  expect(resolvePlayers).toHaveBeenLastCalledWith(
    expect.arrayContaining([{ localPlayerId: '1'.padStart(32, '0'), playerId: '1' }]),
    'tekken-8'
  );

  const pending = deferred<ReturnType<typeof savedPlayer>[]>();
  resolvePlayers.mockReturnValue(pending.promise);
  await act(async () => hook.current.useFinalStandings(standings('second')));
  await act(async () =>
    hook.current.setEntrant(0, { character: 'Paul', characters: ['Paul'], characterAssetId: 'paul.png' })
  );
  await act(async () => pending.resolve([savedPlayer('King', 'king-3.png')]));
  expect(hook.current.draft.entrants[0]).toMatchObject({ character: 'Paul', characterAssetId: 'paul.png' });
});

it('applies saved artwork while preserving an unrelated field edited during the library lookup', async () => {
  const pending = deferred<ReturnType<typeof savedPlayer>[]>();
  resolvePlayers.mockReturnValue(pending.promise);
  const hook = await mountHook(() => useTopEightDraft('street-fighter-6'));
  await act(async () => hook.current.useFinalStandings(standings('first', 'Ryu')));
  await act(async () => hook.current.setEntrant(0, { country: 'HN' }));
  await act(async () => pending.resolve([savedPlayer()]));
  expect(hook.current.draft.entrants[0]).toMatchObject({ country: 'HN', characterAssetId: 'ryu-2.png' });
});
