// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import type { ExhibitionGameSelection, OverlayState, SelectedSetState } from '@shared/models';
import type { GameCharacterPreparation } from '@shared/startggVideogames';
import { createTestOverlayState } from '@shared/testFixtures';
import { mountView } from '../renderer/src/hooks/hookTestHarness';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { OperatorDashboard } from '../renderer/src/ui/OperatorDashboard';
import type { BracketController } from '../renderer/src/ui/operator/bracketController';
import { invalidateCatalogConsumers } from '../renderer/src/hooks/useCatalogRevision';

const transport = vi.hoisted(() => ({
  state: vi.fn(),
  selectGame: vi.fn(),
  clear: vi.fn(),
  save: vi.fn(),
  score: vi.fn(),
  reset: vi.fn(),
  characters: vi.fn(),
  prepare: vi.fn(),
  notice: vi.fn()
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: transport.notice } }));
vi.mock('../renderer/src/ui/operator/OperatorTopbar', () => ({ OperatorTopbar: () => null }));
// Keep tournament navigation small while exercising the dashboard's real controller.
vi.mock('../renderer/src/ui/operator/StartggPanel', () => ({
  StartggPanel: ({
    bracket,
    children,
    setSelector
  }: {
    bracket: BracketController;
    children?: ReactNode;
    setSelector?: ReactNode;
  }) =>
    h(
      'div',
      null,
      h('button', { onClick: () => void bracket.actions.loadEvents('autumn-finals') }, 'Load tournament'),
      h('button', { onClick: () => void bracket.actions.unloadTournament() }, 'Unload tournament'),
      children,
      setSelector
    )
}));
vi.mock('../renderer/src/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../renderer/src/api')>();
  return {
    ...original,
    websocketUrl: async () => 'ws://127.0.0.1/ws',
    api: {
      ...original.api,
      state: transport.state,
      selectExhibitionGame: transport.selectGame,
      clearSelectedSet: transport.clear,
      updateSelectedSet: transport.save,
      setScore: transport.score,
      resetScores: transport.reset,
      reportRendererDiagnostic: vi.fn(),
      gameCharacterAssets: transport.characters,
      prepareGameCharacters: transport.prepare,
      gameProfiles: async () => ({ profiles: Object.values(gameProfiles) }),
      countries: async () => ({ countries: [] }),
      logos: async () => ({ logos: [] }),
      tokenStatus: async () => ({ configured: true, storageAvailable: true, sessionOnly: false }),
      recentTournaments: async () => ({ tournaments: [] }),
      health: async () => ({ port: 4279, recoveryNotices: [] }),
      videogames: async () => ({
        cached: false,
        games: [
          { id: '334', name: 'Samurai Shodown' },
          { id: '49783', name: 'Tekken 8' }
        ]
      }),
      events: async () => ({
        source: 'live',
        events: [{ id: 'event', name: 'Singles', videogame: { id: '49783', name: 'Tekken 8' } }]
      }),
      phases: async () => ({ source: 'live', phases: [] }),
      sets: async () => ({
        source: 'live',
        sets: [
          {
            id: 'set',
            state: '1',
            entrantOne: { id: 'p1', name: 'Bracket Alpha' },
            entrantTwo: { id: 'p2', name: 'Bracket Beta' }
          }
        ],
        pageInfo: { page: 1, totalPages: 1, total: 1, perPage: 20 }
      }),
      inspectStartggSet: async () => ({
        source: 'live',
        selectedSet: {
          ...createTestOverlayState('tekken-8').selectedSet,
          setId: 'set',
          playerOne: { entrantId: 'p1', name: 'Bracket Alpha', score: 0 },
          playerTwo: { entrantId: 'p2', name: 'Bracket Beta', score: 0 }
        }
      }),
      streamQueue: async () => ({ source: 'live', assignments: [] })
    }
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('plays best-of, first-to and Topanga exhibitions and clears the game after unloading a tournament', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  vi.useFakeTimers();
  vi.stubGlobal(
    'WebSocket',
    class extends EventTarget {
      close() {}
    }
  );
  function freshState(): OverlayState {
    const state = createTestOverlayState();
    delete state.selectedSet.assetCatalogSlug;
    return state;
  }
  let live = freshState();
  let rosterReady = false;
  transport.state.mockImplementation(async () => live);
  transport.clear.mockImplementation(async () => {
    live = freshState();
    return live;
  });
  transport.characters.mockImplementation(async (slug: string) => ({
    assets: rosterReady && slug === 'samurai-shodown' ? [{ character: 'Haohmaru', variants: [] }] : []
  }));
  transport.prepare.mockImplementation(async (slug: string): Promise<GameCharacterPreparation> => {
    if (slug === 'samurai-shodown' && !rosterReady) {
      rosterReady = true;
      invalidateCatalogConsumers();
    }
    return { rosterAvailable: true, created: 0 };
  });
  transport.selectGame.mockImplementation(async (selection: ExhibitionGameSelection) => {
    live = { selectedSet: { ...live.selectedSet, ...selection } };
    return live;
  });
  transport.save.mockImplementation(async (selectedSet: SelectedSetState) => {
    live = { selectedSet };
    return live;
  });
  transport.score.mockImplementation(async (side: 'one' | 'two', score: number) => {
    const player = side === 'one' ? 'playerOne' : 'playerTwo';
    live = {
      selectedSet: {
        ...live.selectedSet,
        gameHistory: undefined,
        [player]: { ...live.selectedSet[player], score }
      }
    };
    return live;
  });
  transport.reset.mockImplementation(async () => {
    live = {
      selectedSet: {
        ...live.selectedSet,
        playerOne: { ...live.selectedSet.playerOne, score: 0 },
        playerTwo: { ...live.selectedSet.playerTwo, score: 0 },
        gameHistory: []
      }
    };
    return live;
  });
  const view = await mountView(() => h(MantineProvider, { env: 'test' }, h(OperatorDashboard)));
  function gameInput(labelText: string) {
    const label = [...view.container.querySelectorAll('.editor-panel label')].find(
      (label) => label.textContent === labelText
    ) as HTMLLabelElement | undefined;
    expect(label).toBeDefined();
    return document.getElementById(label!.htmlFor) as HTMLInputElement;
  }
  async function chooseGame(name: string) {
    await act(async () => gameInput('Game').click());
    const option = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent === name);
    expect(option).toBeDefined();
    await act(async () => (option as HTMLElement).click());
  }
  async function click(label: string) {
    const button = [...view.container.querySelectorAll('button')].find((item) => item.textContent === label);
    await act(async () => button!.click());
  }
  expect(gameInput('Game').value).toBe('');
  expect(gameInput('Game').readOnly).toBe(false);
  // Broadcast inputs are available directly, and still flow through the guarded stream autosave.
  const rails = view.container.querySelector<HTMLInputElement>('[data-testid=editor-info-bar-enabled]')!;
  const leftRail = view.container.querySelector<HTMLInputElement>('[data-testid=editor-info-left]')!;
  await act(async () => {
    if (!rails.checked) rails.click();
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(leftRail.disabled).toBe(false);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(leftRail, '!bracket');
    leftRail.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(live.selectedSet.broadcast).toMatchObject({ infoBarEnabled: true, infoLeft: '!bracket' });
  const playersLink = view.container.querySelector<HTMLButtonElement>('.editor-panel button.mantine-Anchor-root')!;
  expect(playersLink.textContent).toBe('Players');
  await act(async () => playersLink.click());
  const library = document.querySelector<HTMLElement>('[role=dialog]')!;
  expect(library.textContent).toContain('Add player');
  await act(async () => library.querySelector<HTMLButtonElement>('.mantine-Modal-close')!.click());
  await chooseGame('Samurai Shodown');
  expect(gameInput('Game').value).toBe('Samurai Shodown');
  expect(transport.selectGame).toHaveBeenCalledWith(
    expect.objectContaining({
      gameName: 'Samurai Shodown',
      videogameId: '334',
      assetCatalogSlug: 'samurai-shodown'
    })
  );
  expect(transport.prepare).toHaveBeenCalledWith('samurai-shodown', '334');
  await act(async () =>
    view.container.querySelector<HTMLInputElement>('[data-testid="editor-one-character"]')?.click()
  );
  expect([...document.querySelectorAll('[role="option"]')].some((item) => item.textContent === 'Haohmaru')).toBe(true);
  await act(async () =>
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  const formats = [
    { matchFormat: 'best-of', target: 2, label: 'Best of 3' },
    { matchFormat: 'first-to', target: 10, label: 'First to 10' }
  ];
  for (const { matchFormat, target, label } of formats) {
    const length = view.container.querySelector<HTMLInputElement>('[data-testid="editor-best-of"]')!;
    await act(async () => length.click());
    const option = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent === label);
    expect(option, `${label} is available without a tournament`).toBeDefined();
    await act(async () => {
      (option as HTMLElement).click();
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(live.selectedSet).toMatchObject({ matchFormat, bestOf: target * 2 - 1 });
    expect(view.container.querySelector('.preview-panel')?.textContent).toContain(label);
    const increase = view.container.querySelector<HTMLButtonElement>('[aria-label="Increase Player 1 score"]')!;
    for (let score = 1; score <= target; score += 1) {
      expect(increase.disabled, `${label}: point ${score}`).toBe(false);
      await act(async () => increase.click());
      expect(live.selectedSet.playerOne.score).toBe(score);
    }
    expect(increase.disabled).toBe(true);
    const callsAtLimit = transport.score.mock.calls.length;
    await act(async () => increase.click());
    expect(transport.score).toHaveBeenCalledTimes(callsAtLimit);
    if (matchFormat === 'first-to')
      expect(view.container.querySelector('[data-testid="report-startgg-result"]')).toBeNull();
    await click('Reset scores');
    expect(live.selectedSet.playerOne.score).toBe(0);
    expect(increase.disabled).toBe(false);
  }
  const length = view.container.querySelector<HTMLInputElement>('[data-testid="editor-best-of"]')!;
  await act(async () => length.click());
  const lengthDropdown = document.getElementById(length.getAttribute('aria-controls')!)!;
  const lengthOptions = [...lengthDropdown.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(lengthOptions.map((option) => option.textContent)).toEqual([
    'Best of 3', 'Best of 5', 'First to 2', 'First to 3', 'First to 5', 'First to 7', 'First to 10', 'Topanga Rules'
  ]);
  await act(async () => {
    lengthOptions.at(-1)!.click();
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(live.selectedSet).toMatchObject({ matchFormat: 'topanga', bestOf: 13 });
  expect(view.container.querySelector('.preview-panel')?.textContent).toContain('Topanga Rules');
  expect(view.container.querySelector('[data-testid="report-startgg-result"]')).toBeNull();
  const increaseOne = view.container.querySelector<HTMLButtonElement>('[aria-label="Increase Player 1 score"]')!;
  const increaseTwo = view.container.querySelector<HTMLButtonElement>('[aria-label="Increase Player 2 score"]')!;
  for (let score = 1; score <= 5; score += 1) {
    await act(async () => increaseOne.click());
    await act(async () => increaseTwo.click());
  }
  await act(async () => increaseOne.click());
  await act(async () => increaseOne.click());
  expect(live.selectedSet.playerOne.score).toBe(7);
  expect(increaseOne.disabled).toBe(true); // 7–5 is a win.
  await act(async () => increaseTwo.click());
  expect(increaseOne.disabled).toBe(false); // 7–6 still needs a second clear win.
  await act(async () => increaseOne.click());
  expect(live.selectedSet.playerOne.score).toBe(8);
  expect(increaseOne.disabled).toBe(true); // 8–6 is a win.
  await act(async () => increaseTwo.click());
  await act(async () => increaseTwo.click());
  await act(async () => increaseOne.click());
  expect(increaseOne.disabled).toBe(false); // 9–8 can reach 10.
  await act(async () => increaseTwo.click());
  expect(live.selectedSet.playerTwo.score).toBe(9);
  await act(async () => increaseOne.click());
  expect(live.selectedSet.playerOne.score).toBe(10);
  expect(increaseOne.disabled).toBe(true);
  await click('Reset scores');

  await click('Load tournament');
  expect(gameInput('Detected game').value).toBe('Tekken 8');
  expect(gameInput('Detected game').readOnly).toBe(true);
  await act(async () => length.click());
  expect(
    [...document.getElementById(length.getAttribute('aria-controls')!)!.querySelectorAll('[role="option"]')].map(
      (option) => option.textContent
    )
  ).toEqual(['Best of 3', 'Best of 5']);
  await act(async () => length.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await act(async () => view.container.querySelector<HTMLButtonElement>('[data-testid="set-set"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('.score-choice')!.click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const quickLength = dialog.querySelector<HTMLInputElement>('input')!;
  const quickIncrease = dialog.querySelector<HTMLButtonElement>('[aria-label="Increase Bracket Alpha score"]')!;
  const quickReset = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Reset scores'
  )!;
  function quickLengthOptions() {
    const dropdown = document.getElementById(quickLength.getAttribute('aria-controls')!)!;
    return [...dropdown.querySelectorAll<HTMLElement>('[role="option"]')];
  }
  for (const target of [2, 3]) {
    await act(async () => quickReset.click());
    await act(async () => quickLength.click());
    const options = quickLengthOptions();
    expect(options.map((option) => option.textContent)).toEqual(['Best of 3', 'Best of 5']);
    await act(async () => options.find((option) => option.textContent === `Best of ${target * 2 - 1}`)!.click());
    for (let score = 1; score <= target; score += 1) {
      expect(quickIncrease.disabled).toBe(false);
      await act(async () => quickIncrease.click());
      expect(dialog.querySelector('.quick-score-value')?.textContent).toBe(String(score));
    }
    expect(quickIncrease.disabled).toBe(true);
    expect(dialog.querySelector<HTMLButtonElement>('[data-testid="quick-report-startgg-result"]')?.disabled).toBe(
      false
    );
  }
  await act(async () => quickLength.click());
  const bestOfThree = quickLengthOptions().find((option) => option.textContent === 'Best of 3')!;
  await act(async () => bestOfThree.click());
  expect(dialog.querySelector('.quick-score-value')?.textContent).toBe('2');
  expect(quickIncrease.disabled).toBe(true);
  expect(live.selectedSet.playerOne.score).toBe(0);
  await act(async () => dialog.querySelector<HTMLButtonElement>('.mantine-Modal-close')!.click());
  await click('Unload tournament');
  expect(gameInput('Game').value).toBe('');
  expect(gameInput('Game').readOnly).toBe(false);
  expect(live.selectedSet.gameName).toBeUndefined();
  await chooseGame('Samurai Shodown');
  expect(transport.selectGame).toHaveBeenCalledTimes(2);
  expect(transport.notice).not.toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }));
  await view.unmount();
}, 15_000);
