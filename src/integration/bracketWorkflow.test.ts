// @vitest-environment happy-dom
import { act, createElement as h, useEffect, useRef, useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import type { StartggGateway } from '@shared/startggGateway';
import { createTestOverlayState } from '@shared/testFixtures';
import { mountView } from '../renderer/src/hooks/hookTestHarness';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { StartggPanel } from '../renderer/src/ui/operator/StartggPanel';
import { SetSelectorPanel } from '../renderer/src/ui/operator/SetSelectorPanel';
import { useBracketBrowser } from '../renderer/src/ui/operator/useBracketBrowser';
import { beginPendingWrite } from '../renderer/src/pendingWrites';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('../renderer/src/api', async (original) => {
  const actual = await original<typeof import('../renderer/src/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      prepareGameCharacters: async () => ({ rosterAvailable: true, created: 0 }),
      gameCharacterAssets: async () => ({ assets: [] }),
      resolvePlayerMedia: async () => ({ subjects: [] }),
      playerMedia: async () => ({ playerOne: {}, playerTwo: {} }),
      videogames: async () => ({ games: [], cached: false }),
      eventStandings: async () => {
        throw new Error('Not final');
      }
    }
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads pool matches and reuses the selector across workspaces without bypassing pending saves', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  const pageInfo = { page: 1, perPage: 20, total: 10, totalPages: 1 };
  const sets = Array.from({ length: 10 }, (_, index) => ({
    id: String(index + 1),
    state: '3',
    round: 'Winners Round 1',
    entrantOne: { id: '11', name: 'Alpha' },
    entrantTwo: { id: '12', name: 'Beta' }
  }));
  const gateway = {
    events: vi.fn(async () => ({
      source: 'live',
      events: [{ id: '1708357', name: 'Funda Series', videogame: { id: '43868', name: 'Street Fighter 6' } }]
    })),
    phases: vi.fn(async () => ({ source: 'live', phases: [{ id: '2395932', name: 'Top 8' }] })),
    phaseGroups: vi.fn(async () => ({
      source: 'live',
      phaseGroups: [{ id: '3453929', displayIdentifier: '1' }],
      pageInfo: { ...pageInfo, total: 1 }
    })),
    sets: vi.fn(async () => ({ source: 'live', sets, pageInfo })),
    streamQueue: vi.fn(async () => ({ source: 'live', assignments: [] }))
  };
  const openSet = vi.fn();
  let setBusy!: (value: boolean) => void;
  function Workspace() {
    const [loading, setLoading] = useState(false);
    setBusy = setLoading;
    const browser = useBracketBrowser({
      startgg: gateway as unknown as StartggGateway,
      setLoading,
      setMessage() {},
      setTokenVerified() {}
    });
    const tokenInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
      browser.actions.setRecentTournaments([{ slug: 'funda-series-27', openedAt: new Date().toISOString() }]);
    }, []);
    return h(StartggPanel, {
      bracket: browser,
      keyboardShortcuts: { enabled: false, setEnabled() {} },
      tokenInputRef,
      tokenConfigured: true,
      tokenStorageAvailable: true,
      tokenInputReady: false,
      profiles: Object.values(gameProfiles),
      activeSet: createTestOverlayState().selectedSet,
      logos: [],
      countries: [],
      loading,
      reloadingAssets: false,
      reloadSelectedSetDisabled: true,
      unloadTournamentDisabled: false,
      assetCatalogRevision: 0,
      moderationRevision: 0,
      onReloadAssets() {},
      onTokenInputReady() {},
      onSaveToken() {},
      onRemoveToken() {},
      onReloadSelectedSet() {},
      onCustomScoreboard() {},
      onMessage() {},
      onModerationApplied() {},
      onCopy() {},
      setSelector: ({ inDialog, onClose }) => h(SetSelectorPanel, {
        inDialog,
        sets: browser.state.sets,
        visibleSets: browser.state.sets,
        assignments: [],
        scope: browser.state.setScope,
        scopeLabel: 'Funda Series',
        pageInfo: browser.state.setPageInfo,
        search: '',
        searchLoading: false,
        searchCatalogIsCurrent: false,
        selectedEvent: Boolean(browser.state.selectedEventId),
        draftDirty: false,
        modalOpen: false,
        loading,
        loadingMore: false,
        onSearchFocus() {},
        onSearchChange() {},
        onCancelSearch() {},
        onOpenSet(set) { onClose(); openSet(set); },
        onLoadMore() {}
      })
    });
  }
  const view = await mountView(() => h(MantineProvider, { env: 'test' }, h(Workspace)));
  expect(view.container.querySelector('.bracket-overview-grid')).toBeNull();
  const recent = [...view.container.querySelectorAll('button')].find(
    (button) => button.textContent === 'funda-series-27'
  )!;
  await act(async () => recent.click());
  expect(view.container.querySelector('.bracket-overview-grid')).not.toBeNull();
  expect(view.container.querySelectorAll('.set-row')).toHaveLength(10);
  async function choose(label: string, option: string) {
    const node = [...view.container.querySelectorAll('label')].find((node) => node.textContent === label)!;
    await act(async () => (document.getElementById(node.htmlFor) as HTMLInputElement).click());
    const choice = [...document.querySelectorAll('[role=option]')].find((node) => node.textContent === option)!;
    expect(choice).toBeDefined();
    await act(async () => (choice as HTMLElement).click());
  }
  await choose(i18n.t('operator:browser.phase'), 'Top 8');
  await choose(i18n.t('operator:browser.pool'), '1');
  expect(gateway.sets).toHaveBeenLastCalledWith(
    { type: 'phaseGroup', eventId: '1708357', phaseGroupId: '3453929' },
    1
  );
  expect(view.container.querySelectorAll('.set-row')).toHaveLength(10);
  const selectorButton = () => [...view.container.querySelectorAll('button')].find(
    (button) => button.textContent === i18n.t('operator:selector.open')
  )!;
  expect(selectorButton().disabled).toBe(true);
  const thumbnailTab = [...view.container.querySelectorAll('[role=tab]')].find(
    (node) => node.textContent === 'YouTube Thumbnail Generator'
  )!;
  await act(async () => (thumbnailTab as HTMLElement).click());
  expect(selectorButton().disabled).toBe(false);
  const requestsBeforeOpening = gateway.sets.mock.calls.length;
  await act(async () => selectorButton().click());
  const dialog = [...document.querySelectorAll('[role=dialog]')].find((node) => node.querySelector('.set-list'))!;
  const title = document.getElementById(dialog.getAttribute('aria-labelledby')!);
  expect(title?.textContent).toBe('Select set · Top 8');
  expect(dialog.querySelectorAll('.set-row')).toHaveLength(10);
  expect(document.querySelectorAll('.set-row')).toHaveLength(10);
  expect(gateway.sets).toHaveBeenCalledTimes(requestsBeforeOpening);
  let finishSave!: () => void;
  await act(async () => { finishSave = beginPendingWrite(); });
  expect((dialog.querySelector('.set-row') as HTMLButtonElement).disabled).toBe(true);
  expect(dialog.querySelectorAll('.mantine-Loader-root')).toHaveLength(1);
  await act(async () => setBusy(true));
  expect(dialog.querySelectorAll('.mantine-Loader-root')).toHaveLength(1);
  expect(dialog.querySelector('[role=status]')?.getAttribute('aria-label')).toBe(i18n.t('common:status.loading'));
  await act(async () => setBusy(false));
  expect(dialog.querySelectorAll('.mantine-Loader-root')).toHaveLength(1);
  expect(dialog.querySelector('[role=status]')?.getAttribute('aria-label')).toBe(i18n.t('operator:selector.dirtyWarning'));
  await act(async () => finishSave());
  expect(dialog.querySelectorAll('.mantine-Loader-root')).toHaveLength(0);
  await act(async () => (dialog.querySelector('.set-row') as HTMLElement).click());
  expect(openSet).toHaveBeenCalledWith(sets[0]);
  expect(document.querySelector('[role=dialog] .set-list')).toBeNull();
  expect(thumbnailTab.getAttribute('aria-selected')).toBe('true');
  for (const language of ['en', 'es-419']) {
    await act(async () => { await i18n.changeLanguage(language); });
    const tools = [...view.container.querySelectorAll('.workspace-maintenance-group')].find(
      (group) => group.querySelector('.workspace-maintenance-label')?.textContent === i18n.t('operator:quickTools.tools')
    )!;
    const labels = [...tools.querySelectorAll('button')]
      .filter((button) => !button.closest('[role=dialog]'))
      .map((button) => button.textContent);
    expect(labels.slice(-3)).toEqual([
      i18n.t('operator:selector.open'),
      i18n.t('operator:appearance.settings'),
      `${i18n.t('operator:help.title')}▾`
    ]);
  }
  await act(async () => { await i18n.changeLanguage('en'); });
  const bracketTab = [...view.container.querySelectorAll('[role=tab]')].find(
    (node) => node.textContent === 'Bracket Management'
  )!;
  await act(async () => (bracketTab as HTMLElement).click());
  expect(selectorButton().disabled).toBe(true);
  expect(view.container.querySelectorAll('.set-row')).toHaveLength(10);
  expect(view.container.querySelector('.set-list h2')?.textContent).toBe('Select set');
  const allEventSets = [...view.container.querySelectorAll('button')].find(
    (button) => button.textContent === i18n.t('operator:browser.allEventSets')
  )!;
  await act(async () => allEventSets.click());
  await act(async () => (thumbnailTab as HTMLElement).click());
  await act(async () => selectorButton().click());
  const eventDialog = [...document.querySelectorAll('[role=dialog]')].find((node) => node.querySelector('.set-list'))!;
  const eventTitle = document.getElementById(eventDialog.getAttribute('aria-labelledby')!);
  expect(eventTitle?.textContent).toBe('Select set · Funda Series');
  expect(gateway.events).toHaveBeenCalledOnce();
  await act(async () => (eventDialog.querySelector('.mantine-Modal-close') as HTMLButtonElement).click());
  await act(async () => (bracketTab as HTMLElement).click());
  const bracketOptions = [...view.container.querySelectorAll('button')].find(
    (button) => button.textContent === i18n.t('operator:quickTools.bracketOptions') + '▾'
  )!;
  await act(async () => bracketOptions.click());
  await act(async () => (document.querySelector('[data-testid="unload-tournament"]') as HTMLButtonElement).click());
  expect(view.container.querySelector('.bracket-overview-grid')).toBeNull();
}, 15000);
