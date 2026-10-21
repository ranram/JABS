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

it('loads event, phase, and pool matches through the real workspace and keeps them when switching tabs', async () => {
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
  function Workspace() {
    const [loading, setLoading] = useState(false);
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
      tokenSessionOnly: false,
      tokenVerified: true,
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
      setSelector: h(SetSelectorPanel, {
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
        onOpenSet() {},
        onLoadMore() {}
      })
    });
  }
  const view = await mountView(() => h(MantineProvider, { env: 'test' }, h(Workspace)));
  const recent = [...view.container.querySelectorAll('button')].find(
    (button) => button.textContent === 'funda-series-27'
  )!;
  await act(async () => recent.click());
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
  for (const label of ['YouTube Thumbnail Generator', 'Bracket Management']) {
    const tab = [...view.container.querySelectorAll('[role=tab]')].find((node) => node.textContent === label)!;
    await act(async () => (tab as HTMLElement).click());
  }
  expect(view.container.querySelectorAll('.set-row')).toHaveLength(10);
  expect(gateway.events).toHaveBeenCalledOnce();
}, 15000);
