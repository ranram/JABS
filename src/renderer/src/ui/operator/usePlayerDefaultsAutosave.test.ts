// @vitest-environment happy-dom
import { act, useState } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { LibraryPlayer } from '@shared/playerLibrary';
import type { SelectedSetState } from '@shared/models';
import { createTestOverlayState } from '@shared/testFixtures';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { initializeI18n, i18n } from '../../i18n';
import { usePlayerDefaultsAutosave } from './usePlayerDefaultsAutosave';

const transport = vi.hoisted(() => ({ load: vi.fn(), resolve: vi.fn(), save: vi.fn(), notice: vi.fn() }));
vi.mock('../../api', () => ({
  api: {
    libraryPlayer: transport.load,
    resolvePlayers: transport.resolve,
    saveLibraryPlayer: transport.save
  }
}));
beforeAll(initializeI18n);
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
const localId = (id: string) => id.padStart(32, '0');
function player(id = '1'): LibraryPlayer {
  return {
    localId: localId(id),
    playerId: id,
    imported: {
      name: 'Imported',
      prefix: 'Team',
      country: 'US',
      state: 'CA',
      xHandle: null,
      pronouns: null,
      profileSlug: null
    },
    overrides: { name: 'Saved name', prefix: 'Saved team' },
    aliases: ['Original alias'],
    games: [
      {
        gameKey: 'street-fighter-6',
        characters: ['Ryu'],
        characterAssetId: 'ryu.png',
        portraitAssetId: 'ryu-portrait.png'
      },
      { gameKey: 'tekken-8', characters: ['King'], characterAssetId: 'king.png', portraitAssetId: null }
    ],
    scoreboardPhoto: {
      source: 'photo',
      assetId: 'player.png',
      fingerprint: '1234567890abcdef',
      crop: { x: 0.5, y: 0.35, zoom: 1 }
    },
    updatedAt: '1',
    seenAt: '1'
  };
}
function initial(): SelectedSetState {
  const value = createTestOverlayState('street-fighter-6').selectedSet;
  return {
    ...value,
    assetCatalogSlug: 'street-fighter-6',
    playerOne: {
      ...value.playerOne,
      localPlayerId: localId('1'),
      playerId: '1',
      name: 'One',
      country: 'US',
      state: 'CA',
      character: 'Ryu',
      characters: ['Ryu'],
      characterAssetId: 'ryu.png'
    },
    playerTwo: { ...value.playerTwo, localPlayerId: localId('2'), playerId: '2', name: 'Two' }
  };
}
function useEditor() {
  const [draft, setDraft] = useState(initial);
  const { patch, flush } = usePlayerDefaultsAutosave(
    draft,
    (change) => setDraft((current) => ({ ...current, ...change })),
    transport.notice
  );
  return { draft, setDraft, patch, flush };
}

it('autosaves only edited profile and detected-game defaults while preserving identity, framing, and other games', async () => {
  vi.useFakeTimers();
  let record = player();
  transport.load.mockImplementation(async () => structuredClone(record));
  transport.save.mockImplementation(async (value: LibraryPlayer) => {
    record = { ...value, updatedAt: String(Number(value.updatedAt) + 1) };
    return { player: record, warnings: [] };
  });
  const original = structuredClone(record);
  const hook = await mountHook(useEditor);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(transport.load).not.toHaveBeenCalled();
  await act(async () =>
    hook.current.patch({
      playerOne: {
        ...hook.current.draft.playerOne,
        name: 'Temporary name',
        prefix: 'Temporary sponsor',
        score: 2,
        seed: 8
      }
    })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(transport.save).not.toHaveBeenCalled();
  await act(async () =>
    hook.current.patch({
      playerOne: {
        ...hook.current.draft.playerOne,
        country: 'JP',
        state: undefined,
        displayFlag: 'JP',
        pronouns: 'they/them',
        xHandle: 'handle',
        character: 'Ken',
        characters: ['Ken'],
        characterAssetId: 'ken-2.png'
      },
      stylingGameId: 'tekken-8'
    })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(399);
  });
  expect(transport.save).not.toHaveBeenCalled();
  await act(async () => {
    await hook.current.flush();
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(transport.save).toHaveBeenCalledTimes(1);
  expect(record.overrides).toEqual({
    ...original.overrides,
    country: 'JP',
    state: '',
    displayFlag: 'JP',
    pronouns: 'they/them',
    xHandle: 'handle'
  });
  expect(record.games[0]).toMatchObject({
    gameKey: 'street-fighter-6',
    characters: ['Ken'],
    characterAssetId: 'ken-2.png',
    portraitAssetId: null
  });
  expect(record.games[1]).toEqual(original.games[1]);
  expect(record.imported).toEqual(original.imported);
  expect(record.aliases).toEqual(original.aliases);
  expect(record.scoreboardPhoto).toEqual(original.scoreboardPhoto);
  expect(record.localId).toBe(original.localId);
  expect(record.playerId).toBe(original.playerId);
  await act(async () =>
    hook.current.patch({
      playerOne: { ...hook.current.draft.playerOne, pronouns: undefined, xHandle: undefined, displayFlag: undefined }
    })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(record.overrides).toMatchObject({ pronouns: '', xHandle: '', displayFlag: '' });
  await act(async () =>
    hook.current.patch({
      playerOne: {
        ...hook.current.draft.playerOne,
        localPlayerId: localId('2'),
        playerId: '2',
        country: 'BR'
      }
    })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(transport.save).toHaveBeenCalledTimes(2);
  await act(async () => hook.current.patch({ playerOne: { ...hook.current.draft.playerOne, xHandle: 'other' } }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(transport.save).toHaveBeenCalledTimes(2);
  expect(transport.notice).toHaveBeenLastCalledWith(
    expect.stringContaining(i18n.t('operator:players.defaultsIdentityChanged')),
    'error'
  );
});

it('keeps queued edits attached to their player and game through slow saves, swaps, failures, and leaving the editor', async () => {
  vi.useFakeTimers();
  const records = new Map([
    ['1', player()],
    ['2', player('2')]
  ]);
  const first = deferred<{ player: LibraryPlayer; warnings: [] }>();
  transport.load.mockImplementation(async (id: string) =>
    structuredClone([...records.values()].find((record) => record.localId === id)!)
  );
  transport.save
    .mockReturnValueOnce(first.promise)
    .mockRejectedValueOnce(new Error('Version changed'))
    .mockImplementation(async (value: LibraryPlayer) => {
      records.set(value.playerId!, { ...value, updatedAt: 'new' });
      return { player: records.get(value.playerId!)!, warnings: [] };
    });
  const hook = await mountHook(useEditor, true);
  await act(async () =>
    hook.current.patch({
      playerOne: { ...hook.current.draft.playerOne, character: 'Ken', characters: ['Ken'], characterAssetId: undefined }
    })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  await act(async () => hook.current.patch({ playerOne: { ...hook.current.draft.playerOne, xHandle: 'latest' } }));
  await act(async () =>
    hook.current.setDraft((value) => ({
      ...value,
      gameId: 'tekken-8',
      assetCatalogSlug: 'tekken-8',
      playerOne: { ...value.playerOne, character: 'King', characters: ['King'] }
    }))
  );
  await act(async () =>
    hook.current.patch({
      playerOne: { ...hook.current.draft.playerOne, character: 'Armor King', characters: ['Armor King'] }
    })
  );
  await act(async () =>
    hook.current.setDraft((value) => ({ ...value, playerOne: value.playerTwo, playerTwo: value.playerOne }))
  );
  const acknowledged = { ...transport.save.mock.calls[0][0], updatedAt: '2' } as LibraryPlayer;
  records.set('1', acknowledged);
  await act(async () => first.resolve({ player: acknowledged, warnings: [] }));
  expect(transport.save).toHaveBeenCalledTimes(2);
  expect(transport.save.mock.calls[1][0]).toMatchObject({ localId: localId('1'), overrides: { xHandle: 'latest' } });
  expect(transport.notice).toHaveBeenLastCalledWith(expect.stringContaining('Version changed'), 'error');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(transport.save).toHaveBeenCalledTimes(2);
  // A concurrent library edit must survive the retry's fresh read.
  records.get('1')!.overrides.nickname = 'New nickname';
  await act(async () => hook.current.patch({ playerTwo: { ...hook.current.draft.playerTwo, pronouns: 'he/him' } }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  const saved = records.get('1')!;
  expect(saved.overrides).toMatchObject({ xHandle: 'latest', pronouns: 'he/him', nickname: 'New nickname' });
  expect(saved.games.find((game) => game.gameKey === 'street-fighter-6')?.characters).toEqual(['Ken']);
  expect(saved.games.find((game) => game.gameKey === 'tekken-8')?.characters).toEqual(['Armor King']);
  const vampire = 'vampire-savior-the-lord-of-vampire';
  await act(async () => hook.current.setDraft((value) => ({
    ...value, gameId: 'street-fighter-6', assetCatalogSlug: vampire,
    playerOne: { ...value.playerOne, characters: [], character: undefined },
    playerTwo: { ...value.playerTwo, characters: [], character: undefined }
  })));
  await act(async () => hook.current.patch({
    playerOne: { ...hook.current.draft.playerOne, characters: ['Morrigan'], character: 'Morrigan' },
    playerTwo: { ...hook.current.draft.playerTwo, characters: ['Demitri'], character: 'Demitri' }
  }));
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(records.get('1')!.games.find((game) => game.gameKey === vampire)?.characters).toEqual(['Demitri']);
  expect(records.get('2')!.games.find((game) => game.gameKey === vampire)?.characters).toEqual(['Morrigan']);
  await act(async () => hook.current.patch({ playerOne: { ...hook.current.draft.playerOne, country: 'JP' } }));
  await hook.unmount();
  expect(transport.save).toHaveBeenCalledTimes(6);
  expect(transport.save.mock.calls[5][0]).toMatchObject({ localId: localId('2'), overrides: { country: 'JP' } });
});
