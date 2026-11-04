// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { libraryPresentationSchema, presentationFields, type LibraryPlayer } from '@shared/playerLibrary';
import { mountView, deferred } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { PlayerNameInput } from './PlayerNameInput';

const transport = vi.hoisted(() => ({ search: vi.fn(), resolve: vi.fn() }));
vi.mock('../../api', () => ({ api: { searchPlayers: transport.search, resolvePlayers: transport.resolve } }));
beforeAll(initializeI18n);
beforeEach(() => {
  vi.useFakeTimers();
  transport.search.mockReset();
  transport.resolve.mockReset();
});
afterEach(() => vi.useRealTimers());

const record: LibraryPlayer = {
  localId: '1'.repeat(32),
  playerId: '7',
  aliases: [],
  games: [],
  overrides: {},
  updatedAt: 'v1',
  seenAt: 'v1',
  imported: {
    name: 'Full Tag',
    prefix: 'TEAM',
    country: 'US',
    state: null,
    xHandle: 'full',
    pronouns: 'they/them',
    profileSlug: null
  }
};
const resolved = libraryPresentationSchema.parse({
  localPlayerId: record.localId,
  playerId: record.playerId,
  name: 'Full Tag',
  prefix: 'TEAM',
  sponsor: 'TEAM',
  country: 'US',
  state: null,
  xHandle: 'full',
  pronouns: 'they/them',
  displayFlag: null,
  playerPhotoAssetId: 'full.png',
  character: 'Ryu',
  characters: ['Ryu'],
  characterAssetId: 'ryu-2.png',
  portraitAssetId: null
});
type Resolution = Array<typeof resolved | null>;

async function fixture() {
  const state = { value: 'Initial name', gameKey: 'street-fighter-6' };
  const commit = vi.fn();
  const select = vi.fn();
  transport.search.mockResolvedValue({ players: [record], total: 1 });
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(PlayerNameInput, {
        ...state,
        label: 'Player',
        onCommit: commit,
        onSelectPlayer: select
      })
    )
  );
  const input = view.container.querySelector('input')!;
  await act(async () => input.focus());
  async function type(text: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTime(250));
  }
  async function choose(keyboard = false) {
    await act(async () => {
      if (keyboard) {
        for (const key of ['ArrowDown', 'Enter'])
          input.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
      } else {
        const option = document.querySelector<HTMLElement>('[role=option]')!;
        expect(option).not.toBeNull();
        option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        option.click();
      }
    });
  }
  return { state, commit, select, input, view, type, choose };
}

it('applies the full player on the first click despite delayed name acknowledgements and blur', async () => {
  const pending = deferred<Resolution>();
  transport.resolve.mockReturnValue(pending.promise);
  const editor = await fixture();
  await editor.type('fu');
  await act(async () => vi.advanceTimersByTime(1250));
  expect(editor.commit).toHaveBeenCalledExactlyOnceWith('fu');
  editor.commit.mockClear();
  await editor.type('ful');
  await editor.choose();
  expect(editor.input.getAttribute('aria-busy')).toBe('true');
  editor.state.value = 'fu'; // The previous free-text save arrives after this selection started.
  await editor.view.rerender();
  expect(editor.input.value).toBe('ful');
  await act(async () => editor.input.blur());
  await act(async () => vi.advanceTimersByTime(2000));
  expect(editor.commit).not.toHaveBeenCalled();
  await act(async () => pending.resolve([resolved]));
  expect(editor.select).toHaveBeenCalledExactlyOnceWith(presentationFields(resolved));
  expect(editor.input.value).toBe('Full Tag');
  expect(editor.input.hasAttribute('aria-busy')).toBe(false);
  await act(async () => {
    editor.input.focus();
    editor.input.blur();
  });
  await act(async () => vi.advanceTimersByTime(2000));
  expect(editor.commit).not.toHaveBeenCalled();
  editor.state.value = resolved.name;
  await editor.view.rerender();
  expect(editor.input.value).toBe('Full Tag');
});

it('discards cancelled selections even when the same query is typed again, and supports keyboard selection', async () => {
  const cancelled = deferred<Resolution>();
  const current = deferred<Resolution>();
  transport.resolve.mockReturnValueOnce(cancelled.promise).mockReturnValueOnce(current.promise);
  const editor = await fixture();
  await editor.type('fu');
  await editor.choose(true);
  expect(transport.resolve).toHaveBeenCalledTimes(1);
  await editor.type('different');
  await editor.type('fu');
  await act(async () => cancelled.resolve([resolved]));
  expect(editor.select).not.toHaveBeenCalled();
  expect(editor.input.value).toBe('fu');
  await editor.choose(true);
  await act(async () => current.resolve([resolved]));
  expect(editor.select).toHaveBeenCalledExactlyOnceWith(presentationFields(resolved));
  expect(editor.input.value).toBe('Full Tag');
});

it('shows missing-player errors, allows retry, and ignores responses after game changes or unmount', async () => {
  const missing = deferred<Resolution>();
  const oldGame = deferred<Resolution>();
  const unmounted = deferred<Resolution>();
  transport.resolve
    .mockReturnValueOnce(missing.promise)
    .mockReturnValueOnce(oldGame.promise)
    .mockReturnValueOnce(unmounted.promise);
  const editor = await fixture();
  await editor.type('fu');
  await editor.choose();
  await act(async () => missing.resolve([null]));
  expect(editor.select).not.toHaveBeenCalled();
  expect(editor.input.getAttribute('aria-invalid')).toBe('true');
  await act(async () => editor.input.click());
  await act(async () => vi.advanceTimersByTime(250));
  await editor.choose();
  editor.state.gameKey = 'tekken-8';
  await editor.view.rerender();
  await act(async () => oldGame.resolve([resolved]));
  expect(editor.select).not.toHaveBeenCalled();
  await act(async () => editor.input.click());
  await act(async () => vi.advanceTimersByTime(250));
  await editor.choose();
  expect(transport.resolve).toHaveBeenLastCalledWith([{ localPlayerId: record.localId }], 'tekken-8');
  await editor.view.unmount();
  await act(async () => unmounted.resolve([resolved]));
  expect(editor.select).not.toHaveBeenCalled();
});
