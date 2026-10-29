// @vitest-environment happy-dom
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { I18nextProvider } from 'react-i18next';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { MatchesMenu } from '../renderer/src/ui/operator/MatchesMenu';
import { act, createElement as h } from 'react';
import { expect, it, vi } from 'vitest';
import type { StartggEventStandingsResult } from '@shared/models';
import { libraryPresentationSchema, librarySaveSchema } from '@shared/playerLibrary';
import { createTestOverlayState } from '@shared/testFixtures';
import { mountHook, mountView, deferred } from '../renderer/src/hooks/hookTestHarness';
import { useTopEightDraft } from '../renderer/src/ui/operator/useTopEightDraft';
import { useThumbnailDraft } from '../renderer/src/ui/operator/useThumbnailDraft';

const resolve = vi.hoisted(() => vi.fn());
const libraryUi = vi.hoisted(() => ({
  search: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
  lookup: vi.fn(),
  get: vi.fn()
}));
vi.mock('../renderer/src/api', () => ({
  api: {
    resolveScoreboardPhotos: async () => ({ photos: [null] }),
    resolvePlayers: resolve,
    searchPlayers: libraryUi.search,
    saveLibraryPlayer: libraryUi.save,
    deleteLibraryPlayer: libraryUi.delete,
    lookupLibraryPlayer: libraryUi.lookup,
    libraryPlayer: libraryUi.get,
    gameCharacterAssets: async () => ({ assets: [] }),
    countries: async () => ({ countries: [] }),
    videogames: async () => ({ games: [], cached: true })
  }
}));
function saved(id: string, character: string) {
  return libraryPresentationSchema.parse({
    localPlayerId: id.padStart(32, '0'),
    playerId: id,
    name: 'SameTag',
    prefix: null,
    sponsor: null,
    country: 'JP',
    state: null,
    xHandle: null,
    pronouns: null,
    displayFlag: null,
    playerPhotoAssetId: `${id}.png`,
    character,
    characters: [character],
    characterAssetId: null,
    portraitAssetId: null
  });
}
it('uses player IDs across graphics, preserves local edits, and ignores late library responses', async () => {
  resolve.mockImplementation(async (players: Array<{ playerId?: string }>) =>
    players.map(({ playerId }) => (playerId ? saved(playerId, playerId === '1' ? 'Cammy' : 'Ryu') : null))
  );
  const top = await mountHook(() => useTopEightDraft('street-fighter-6'));
  const standings: StartggEventStandingsResult = {
    eventName: 'Weekly',
    finalized: true,
    standings: [1, 2].map((id) => ({ placement: id, playerId: String(id), name: 'SameTag', isFinal: true }))
  };
  await act(async () => top.current.useFinalStandings(standings));
  expect(top.current.draft.entrants.map((player) => player.character)).toEqual(['Cammy', 'Ryu']);
  expect(top.current.draft.entrants.map((player) => player.playerPhotoAssetId)).toEqual(['1.png', '2.png']);
  const calls = resolve.mock.calls.length;
  await act(async () => {
    top.current.setStyle('mosaic');
    top.current.setHeadline('Finalists');
  });
  expect(resolve).toHaveBeenCalledTimes(calls);
  await act(async () => top.current.setEntrant(0, { character: 'Chun-Li', characters: ['Chun-Li'] }));
  await act(async () => top.current.useFinalStandings(standings));
  expect(top.current.draft.entrants[0]?.character).toBe('Chun-Li');
  expect(top.current.draft.entrants[1]?.character).toBe('Ryu');

  const thumbnail = await mountHook(() => useThumbnailDraft());
  await act(async () => thumbnail.current.setPlayer(0, { playerId: '1', name: 'SameTag' }));
  expect(thumbnail.current.draft.players[0].character).toBe('Cammy');
  await act(async () => thumbnail.current.setPlayer(0, { characters: [], character: undefined }));
  expect(thumbnail.current.draft.players[0].character).toBeUndefined();

  const late = deferred<Array<ReturnType<typeof saved>>>();
  resolve.mockReturnValue(late.promise);
  await act(async () => thumbnail.current.setPlayer(1, { playerId: '3', name: 'SameTag' }));
  await act(async () => thumbnail.current.setPlayer(1, { name: 'Manual edit', character: 'Ken', characters: ['Ken'] }));
  await act(async () => late.resolve([saved('1', 'Cammy'), saved('3', 'Ryu')]));
  expect(thumbnail.current.draft.players[1].name).toBe('Manual edit');
  expect(thumbnail.current.draft.players[1].character).toBe('Ken');
});

async function openPlayerLibrary() {
  await initializeI18n();
  await i18n.changeLanguage('en');
  vi.useFakeTimers();
  const notice = vi.spyOn(notifications, 'show').mockReturnValue('player-library-notice');
  const record = {
    localId: '1'.padStart(32, '0'),
    playerId: '1',
    imported: {
      name: 'Original tag',
      prefix: null,
      xHandle: null,
      pronouns: null,
      country: null,
      state: null,
      profileSlug: null
    },
    overrides: { nickname: 'The Champion', pronouns: 'they/them' },
    aliases: ['Original tag'],
    games: [{ gameKey: 'street-fighter-6', characters: ['Cammy'], characterAssetId: null, portraitAssetId: null }],
    updatedAt: '2026-10-13T00:00:00Z',
    seenAt: '2026-10-13T00:00:00Z'
  };
  libraryUi.search.mockImplementation(async (query = '') => ({
    players: query ? [] : [record],
    total: query ? 0 : 274
  }));
  libraryUi.get.mockResolvedValue(record);
  resolve.mockResolvedValue([saved('1', 'Cammy')]);
  const activeSet = createTestOverlayState().selectedSet;
  activeSet.playerOne = {
    ...activeSet.playerOne,
    name: 'On-stream tag',
    playerId: record.playerId,
    localPlayerId: record.localId,
    characters: ['Ken']
  };
  activeSet.playerTwo.name = 'New arrival';
  libraryUi.save.mockReset();
  libraryUi.delete.mockClear();
  libraryUi.lookup.mockReset();
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(I18nextProvider, { i18n }, h(MatchesMenu, { activeSet, setSelectorDisabled: true, onOpenSetSelector() {} }))
    )
  );
  async function click(text: string) {
    const button = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === text || button.getAttribute('aria-label') === text
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  }
  await act(async () => document.querySelector<HTMLButtonElement>('[data-tutorial="matches-menu"]')!.click());
  await click('Players');
  await act(async () => vi.advanceTimersByTimeAsync(250));
  async function close() {
    try {
      await view.unmount();
    } finally {
      notice.mockRestore();
      vi.useRealTimers();
    }
  }
  return { view, notice, record, click, close };
}

it('keeps drafts after failed saves and closes after a successful save', async () => {
  const { record, click, notice, close } = await openPlayerLibrary();
  libraryUi.save.mockRejectedValueOnce(new Error('The player could not be saved.'));
  libraryUi.save.mockImplementationOnce(async (player) => ({
    player: { ...player, updatedAt: '2026-10-13T00:01:00Z' },
    warnings: []
  }));
  try {
    expect(document.querySelector('.player-library-count')?.textContent).toBe(
      '274 players registered in the player library'
    );
    const librarySearch = document.querySelector<HTMLInputElement>('.player-library-list input')!;
    const unfilteredReads = () => libraryUi.search.mock.calls.filter(([query]) => !query).length;
    const reads = unfilteredReads();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(librarySearch, 'Missing player');
      librarySearch.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(document.querySelector('.player-library-count')?.textContent).toBe(
      '274 players registered in the player library'
    );
    expect(document.querySelector('.player-library-list')?.textContent).toContain('No players match this search.');
    expect(unfilteredReads()).toBe(reads);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(librarySearch, '');
      librarySearch.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    await click('On-stream tag');
    expect(document.querySelector('.player-library-detail h3')?.textContent).toBe('Original tag');
    expect(document.querySelector('.player-library-detail-header')?.textContent).not.toContain('Unsaved changes');
    expect(
      [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Save player')
        ?.disabled
    ).toBe(true);
    expect(libraryUi.save).not.toHaveBeenCalled();
    expect(record.games[0].characters).toEqual(['Cammy']);
    await click('Close player');
    expect(document.querySelector('.player-library-detail')).toBeNull();
    expect(document.body.textContent).not.toContain('Unsaved player changes');
    resolve.mockResolvedValueOnce([null]);
    await click('New arrival');
    expect(document.querySelector('.player-library-detail-header')?.textContent).toContain('Unsaved changes');
    await click('Close player');
    expect(document.body.textContent).toContain('Unsaved player changes');
    await click('Discard changes');
    expect(document.querySelector('.player-library-detail')).toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('.player-library-row')!.click());
    const label = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
      (label) => label.textContent === 'Player tag'
    )!;
    const input = document.getElementById(label.htmlFor) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Updated tag');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect([...document.querySelectorAll('label')].some((label) => label.textContent === 'State / region')).toBe(false);
    for (const [field, value] of [
      ['Age', '29'],
      ['Nickname', 'The Champion']
    ]) {
      const label = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
        (label) => label.textContent === field
      )!;
      const input = document.getElementById(label.htmlFor) as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await click('Close player');
    expect(document.querySelector('.player-library-detail')).not.toBeNull();
    await click('Save and continue');
    expect(document.querySelector('.player-library-detail')).not.toBeNull();
    expect(input.value).toBe('Updated tag');
    expect(notice).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Action failed',
        message: 'The player could not be saved.',
        color: 'red'
      })
    );
    expect(libraryUi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        localId: record.localId,
        overrides: { name: 'Updated tag', age: '29', nickname: 'The Champion', pronouns: 'they/them' },
        aliases: ['Original tag']
      })
    );
    await click('Save and continue');
    expect(document.querySelector('.player-library-detail')).toBeNull();
    expect(libraryUi.save).toHaveBeenCalledTimes(2);
    expect(notice).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Done',
        message: expect.stringContaining('Player saved.'),
        color: 'green'
      })
    );
    expect(libraryUi.delete).not.toHaveBeenCalled();
  } finally {
    await close();
  }
});

it('opens lookup results and keeps the selected player after a failed lookup', async () => {
  const { record, click, notice, close } = await openPlayerLibrary();
  try {
    libraryUi.lookup.mockResolvedValueOnce({ player: record, source: 'local' });
    const lookupLabel = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
      (label) => label.textContent === i18n.t('operator:players.lookupLabel')
    )!;
    const lookupInput = document.getElementById(lookupLabel.htmlFor) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        lookupInput,
        'https://start.gg/user/a1b2c3d4'
      );
      lookupInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Find player');
    expect(libraryUi.lookup).toHaveBeenCalledWith('https://start.gg/user/a1b2c3d4');
    expect(document.querySelector('.player-library-detail h3')?.textContent).toContain('Original tag');
    expect(libraryUi.save).toHaveBeenCalledTimes(0);
    libraryUi.lookup.mockRejectedValueOnce(new Error('Public lookup unavailable.'));
    await click('Find player');
    expect(document.querySelector('.player-library-detail h3')?.textContent).toContain('Original tag');
    expect(notice).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Action failed',
        message: 'Public lookup unavailable.',
        color: 'red'
      })
    );
    expect(document.querySelector('.player-library-panel')?.textContent).not.toContain('Public lookup unavailable.');
  } finally {
    await close();
  }
});

it('translates rejected-field notices and protects unsaved drafts on Escape', async () => {
  const { record, click, notice, close } = await openPlayerLibrary();
  try {
    await click('On-stream tag');
    for (const language of ['en', 'es-419']) {
      await act(async () => {
        await i18n.changeLanguage(language);
      });
      expect(document.querySelector('.player-library-count')?.textContent).toBe(
        language === 'en'
          ? '274 players registered in the player library'
          : '274 jugadores registrados en la biblioteca de jugadores'
      );
      expect(i18n.t('operator:players.count', { count: 1 })).toBe(
        language === 'en'
          ? '1 player registered in the player library'
          : '1 jugador registrado en la biblioteca de jugadores'
      );
      for (const field of ['nickname', 'pronouns', 'age'] as const) {
        const label = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
          (label) => label.textContent === i18n.t(`operator:players.fields.${field}`)
        )!;
        const input = document.getElementById(label.htmlFor) as HTMLInputElement;
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
            input,
            field === 'age' ? '29' : 'Rejected draft'
          );
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
      libraryUi.save.mockImplementationOnce(async (player) =>
        librarySaveSchema.parse({
          player: { ...player, overrides: { ...player.overrides, ...record.overrides } },
          warnings: [
            { field: 'nickname', reason: 'blocked-text' },
            { field: 'pronouns', reason: 'blocked-text' }
          ]
        })
      );
      const noticesBefore = notice.mock.calls.length;
      await click(i18n.t('operator:players.save'));
      expect(notice.mock.calls.length).toBe(noticesBefore + 1);
      expect(notice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          color: 'yellow',
          message:
            language === 'en'
              ? 'Blocked changes to Nickname and Pronouns were not saved.'
              : 'No se guardaron los cambios bloqueados en Apodo y Pronombres.'
        })
      );
      expect(notice.mock.calls.at(-1)?.[0].message).not.toContain('Rejected draft');
      for (const [field, expected] of [
        ['nickname', 'The Champion'],
        ['pronouns', 'they/them'],
        ['age', '29']
      ] as const) {
        const label = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
          (label) => label.textContent === i18n.t(`operator:players.fields.${field}`)
        )!;
        expect((document.getElementById(label.htmlFor) as HTMLInputElement).value).toBe(expected);
      }
    }
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    await click('New player');
    const draftInput = document.querySelector<HTMLInputElement>('.player-library-detail input:not([readonly])')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(draftInput, 'Unsaved draft');
      draftInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('.player-library-detail')).not.toBeNull();
    expect(document.body.textContent).toContain('Unsaved player changes');
    await click('Keep editing');
    expect(document.querySelector('.player-library-detail')).not.toBeNull();
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await click('Discard changes');
    expect(document.querySelector('.player-library-panel')).toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('[data-tutorial="matches-menu"]')!.click());
    await click('Players');
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(document.querySelector('.player-library-panel')).not.toBeNull();
    expect(document.querySelector('.player-library-detail')).toBeNull();
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('.player-library-panel')).toBeNull();
  } finally {
    await close();
  }
});
