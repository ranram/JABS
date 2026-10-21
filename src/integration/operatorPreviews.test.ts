// @vitest-environment happy-dom
import { act, createElement as h, useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import { createTestOverlayState, createTestCustomScoreboard } from '@shared/testFixtures';
import type { StartggGateway } from '@shared/startggGateway';
import type { GameCharacterPreparation } from '@shared/startggVideogames';
import type { GameCharacterAsset, StartggEventStandingsResult } from '@shared/models';
import { deferred, mountView } from '../renderer/src/hooks/hookTestHarness';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { TopEightGenerator } from '../renderer/src/ui/operator/TopEightGenerator';
import { ThumbnailGenerator } from '../renderer/src/ui/operator/ThumbnailGenerator';
import { CustomScoreboardPanel } from '../renderer/src/ui/operator/CustomScoreboardPanel';
import { useTopEightDraft } from '../renderer/src/ui/operator/useTopEightDraft';
import { useThumbnailDraft } from '../renderer/src/ui/operator/useThumbnailDraft';
import { useAssetCatalogReload } from '../renderer/src/ui/operator/useAssetCatalogReload';
import { useOperatorNotifications } from '../renderer/src/ui/operator/useOperatorNotifications';
import { StartggPanel } from '../renderer/src/ui/operator/StartggPanel';
import { useBracketBrowser } from '../renderer/src/ui/operator/useBracketBrowser';
import { useCustomScoreboard } from '../renderer/src/hooks/useCustomScoreboard';

const transport = vi.hoisted(() => ({
  revision: 1,
  catalogRevision: 1000,
  games: vi.fn(),
  characters: vi.fn(async (_slug: string): Promise<{ assets: GameCharacterAsset[] }> => ({ assets: [] })),
  artwork: vi.fn(),
  logo: vi.fn(async (_id: string) => `data:image/png;base64,logo${transport.revision}`),
  prepare: vi.fn(async (_slug: string, _id?: string): Promise<GameCharacterPreparation> => ({
    created: 0,
    rosterAvailable: true
  })),
  identity: vi.fn(),
  scoreboards: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  nativePrepare: undefined as ((slug: string, id?: string) => Promise<GameCharacterPreparation>) | undefined,
  nativeEvents: undefined as typeof import('../renderer/src/api').api.events | undefined,
  standings: vi.fn(async (_eventId: string): Promise<StartggEventStandingsResult> => ({
    eventName: 'Singles',
    finalized: false,
    standings: []
  })),
  standingsBySlug: vi.fn(),
  notice: vi.fn()
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: transport.notice } }));
vi.mock('../renderer/src/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../renderer/src/api')>();
  transport.nativePrepare = original.api.prepareGameCharacters;
  transport.nativeEvents = original.api.events;
  return {
    ...original,
    api: {
      ...original.api,
      identityMedia: transport.identity,
      videogames: transport.games,
      gameCharacterAssets: transport.characters,
      gameCharacterAssetUrl: transport.artwork,
      prepareGameCharacters: transport.prepare,
      eventStandings: transport.standings,
      eventStandingsBySlug: transport.standingsBySlug,
      playerPhotoAssetUrl: async () => `data:image/png;base64,photo${transport.revision}`,
      sponsorLogoAssetUrl: async () => `data:image/png;base64,sponsor${transport.revision}`,
      logoAssetUrl: transport.logo,
      logos: async () => ({ logos: [{ id: 'logo.png', label: 'Logo' }] }),
      assetCatalogSummary: async () => ({ logos: [{ id: 'logo.png', label: 'Logo' }], counts: {} }),
      reloadAssets: async () =>
        original.acceptCatalogMessage(
          JSON.stringify({ event: 'asset-catalog', revision: ++transport.catalogRevision })
        ),
      customScoreboards: transport.scoreboards,
      customScoreboardFrameUrl: async () => `data:image/png;base64,frame${transport.revision}`,
      updateCustomScoreboard: transport.save,
      deleteCustomScoreboard: transport.remove
    }
  };
});

const scoreboard = createTestCustomScoreboard();
Object.assign(scoreboard.visibility, { flags: false, tournamentLogo: true, bottomRails: false });
beforeAll(async () => {
  await initializeI18n();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  transport.revision = 1;
  transport.prepare.mockImplementation(async () => ({ created: 0, rosterAvailable: true }));
  transport.characters.mockResolvedValue({ assets: [] });
  transport.logo.mockImplementation(async () => `data:image/png;base64,logo${transport.revision}`);
  transport.standings.mockImplementation(async () => ({ eventName: 'Singles', finalized: false, standings: [] }));
});
const profiles = Object.values(gameProfiles);
const logos = [{ id: 'logo.png', label: 'Logo' }];
const activeSet = createTestOverlayState().selectedSet!;
const characterAssets: GameCharacterAsset[] = [{ character: 'Ryu', assetId: 'Ryu.png', variants: [] }];
activeSet.broadcast = { ...activeSet.broadcast!, logoEnabled: true, logoAssetId: 'logo.png' };

it('imports final standings automatically and refreshes preview media without repeating identity lookups on style edits', async () => {
  vi.useFakeTimers();
  transport.characters.mockResolvedValue({ assets: characterAssets });
  transport.artwork.mockImplementation(async () => `data:image/png;base64,artwork${transport.revision}`);
  transport.identity.mockImplementation(async (subjects: unknown[]) => ({
    matches: subjects.map(() => ({ playerPhotoAssetId: 'player.png', sponsorLogoAssetId: 'sponsor.png' }))
  }));
  transport.scoreboards.mockResolvedValue({ scoreboards: [scoreboard] });
  transport.standings.mockResolvedValueOnce({
    eventName: 'Funda Series',
    eventState: 'COMPLETED',
    finalized: true,
    standings: [1, 2, 3, 4, 5, 5, 7, 7].map((placement, index) => ({
      placement,
      name: `Finalist ${index + 1}`,
      isFinal: index === 7
    }))
  });
  let top!: ReturnType<typeof useTopEightDraft>;
  let thumbnail!: ReturnType<typeof useThumbnailDraft>;
  let reload!: () => Promise<void>;
  let obsFrame: string | undefined;
  function Workspace() {
    obsFrame = useCustomScoreboard('test').frameUrl;
    top = useTopEightDraft();
    thumbnail = useThumbnailDraft();
    const [revision, setRevision] = useState(0);
    const [, setLogos] = useState(logos);
    reload = useAssetCatalogReload({
      assetCatalogSlug: 'street-fighter-6',
      setLogos,
      setAssetCatalogRevision: setRevision
    }).reloadAssets;
    const common = { profiles, logos, countries: [], moderationRevision: 0, assetCatalogRevision: revision };
    return h(
      MantineProvider,
      { env: 'test' },
      h(TopEightGenerator, { ...common, controller: top, selectedEventId: '1724571' }),
      h(ThumbnailGenerator, { ...common, controller: thumbnail }),
      h(CustomScoreboardPanel, { activeSet, onSelect: vi.fn(), onMessage: vi.fn() })
    );
  }
  const view = await mountView(() => h(Workspace));
  expect(transport.standings).toHaveBeenCalledWith('1724571');
  expect(top.draft.tournamentName).toBe('Funda Series');
  expect(top.draft.entrants.map(({ name }) => name)).toEqual(
    Array.from({ length: 8 }, (_, index) => `Finalist ${index + 1}`)
  );
  await act(async () => {
    top.setMediaMode('photo');
    top.setLogo('logo.png');
    thumbnail.setMediaMode('photo');
    thumbnail.setPlayer(0, { country: 'jp' });
    thumbnail.setPlayer(1, { country: 'hn' });
    thumbnail.setText({ logoAssetId: 'logo.png' });
    await vi.advanceTimersByTimeAsync(300);
  });
  function assertImages(revision: number) {
    for (const selector of ['.top8-canvas', '.thumbnail-canvas']) {
      const preview = view.container.querySelector(selector);
      expect(preview, selector).not.toBeNull();
      for (const kind of ['photo', 'sponsor', 'logo']) {
        expect(
          preview!.querySelector(`img[src="data:image/png;base64,${kind}${revision}"]`),
          `${selector}: ${kind}`
        ).not.toBeNull();
      }
    }
    expect(
      view.container.querySelector(`.custom-scoreboard-preview-shell img[src="data:image/png;base64,logo${revision}"]`)
    ).not.toBeNull();
    expect(view.container.querySelectorAll('.thumbnail-identity > .thumbnail-country-flag')).toHaveLength(2);
  }
  assertImages(1);
  // A single nudge checks each screen's binding; shared media tests own the drag mechanics.
  for (const selector of ['.top8-canvas', '.thumbnail-canvas']) {
    await act(async () => {
      view.container
        .querySelector(`${selector} .player-media-photo`)!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await vi.advanceTimersByTimeAsync(100);
    });
    expect((selector === '.top8-canvas' ? top : thumbnail).mediaPlacements[0].photo.x).toBeCloseTo(0.012);
  }
  const initialLookups = transport.identity.mock.calls.length;
  await act(async () => {
    top.setStyle('mosaic');
    thumbnail.setStyle('spotlight');
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(transport.identity).toHaveBeenCalledTimes(initialLookups);
  transport.revision = 2;
  await act(async () => reload());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  assertImages(2);
  expect(obsFrame).toBe('data:image/png;base64,frame2');
  expect(
    view.container.querySelector('.custom-scoreboard-preview-shell img[src="data:image/png;base64,frame2"]')
  ).not.toBeNull();
  expect(transport.identity).toHaveBeenCalledTimes(initialLookups + 2);
  await act(async () => {
    top.setEntrant(0, { character: 'Ryu' });
    thumbnail.setPlayer(0, { character: 'Ryu' });
    top.setMediaMode('character');
    thumbnail.setMediaMode('character');
  });
  const assertArtwork = (revision: number) => {
    for (const selector of ['.top8-canvas', '.thumbnail-canvas']) {
      expect(
        view.container.querySelector(`${selector} img[src="data:image/png;base64,artwork${revision}"]`)
      ).not.toBeNull();
    }
  };
  assertArtwork(2);
  const identityReads = transport.identity.mock.calls.length;
  await act(async () => {
    top.setMediaMode('combined');
    thumbnail.setMediaMode('combined');
  });
  await act(async () => {
    // Each combined layer keeps its own saved placement.
    top.setMediaTransform(0, 'photo', { x: 0.5, y: 0.5, scale: 2, flipped: true });
    thumbnail.setMediaTransform(0, 'photo', { x: 0.5, y: 0.5, scale: 2, flipped: true });
    await vi.advanceTimersByTimeAsync(300);
  });
  assertArtwork(2);
  assertImages(2);
  for (const selector of ['.top8-canvas', '.thumbnail-canvas']) {
    const preview = view.container.querySelector(selector)!;
    const layers = preview.querySelector('.player-media-layers.has-character')!;
    expect(layers.classList.contains('is-combined')).toBe(true);
    expect([...layers.querySelectorAll('img')].map((image) => image.classList.contains('player-media-photo'))).toEqual([
      false,
      true
    ]);
    expect(preview.querySelector('.player-media-photo.keyboard-adjustable-media')).not.toBeNull();
    const photo = preview.querySelector<HTMLImageElement>('.player-media-photo')!;
    await act(async () => photo.dispatchEvent(new Event('error')));
    expect(photo.style.display).toBe('none');
    expect(preview.querySelector('.player-media-character')).not.toBeNull();
    await act(async () => photo.dispatchEvent(new Event('load')));
    expect(photo.style.display).toBe('');
    expect(preview.querySelector<HTMLImageElement>('.player-media-photo')?.style.transform).toBe(
      'translate3d(25cqw, 28.125cqw, 0) scale(2) scaleX(-1)'
    );
  }
  expect(top.mediaPlacements[0].photo.scale).toBe(2);
  expect(thumbnail.mediaPlacements[0].photo.scale).toBe(2);
  expect(transport.identity).toHaveBeenCalledTimes(identityReads);
  await act(async () => {
    top.setMediaMode('character');
    thumbnail.setMediaMode('character');
  });
  let finishCatalog!: (catalog: { assets: GameCharacterAsset[] }) => void;
  const pendingCatalog = new Promise<{ assets: GameCharacterAsset[] }>((resolve) => {
    finishCatalog = resolve;
  });
  transport.characters.mockImplementation(() => pendingCatalog);
  let finishArtwork!: (url: string) => void;
  const pendingArtwork = new Promise<string>((resolve) => {
    finishArtwork = resolve;
  });
  transport.artwork.mockReturnValue(pendingArtwork);
  let finishLogo!: (url: string) => void;
  transport.logo.mockReturnValue(
    new Promise<string>((resolve) => {
      finishLogo = resolve;
    })
  );
  transport.revision = 3;
  await act(async () => reload());
  // Both the catalog and replacement image may take time. Keep the old preview throughout.
  assertArtwork(2);
  for (const selector of ['.top8-canvas', '.thumbnail-canvas']) {
    expect(view.container.querySelector(`${selector} img[src="data:image/png;base64,logo2"]`)).not.toBeNull();
  }
  await act(async () => finishCatalog({ assets: characterAssets }));
  assertArtwork(2);
  await act(async () => {
    finishArtwork('data:image/png;base64,artwork3');
    finishLogo('data:image/png;base64,logo3');
    await vi.advanceTimersByTimeAsync(300);
  });
  assertArtwork(3);
  await act(async () => top.setGameContext('tekken-8', 'Tekken 8', 'tekken-8'));
  expect(view.container.querySelector('.top8-canvas img[src="data:image/png;base64,artwork3"]')).toBeNull();
  transport.characters.mockResolvedValue({ assets: [] });
  await view.unmount();
}, 20_000);

it('explains unavailable public bracket reads without exposing server details', async () => {
  await i18n.changeLanguage('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'anonymous-unavailable', error: 'upstream implementation detail' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
    )
  );
  let browser!: ReturnType<typeof useBracketBrowser>;
  function Workspace() {
    browser = useBracketBrowser({
      startgg: { events: transport.nativeEvents } as unknown as StartggGateway,
      setMessage: useOperatorNotifications(),
      setLoading: vi.fn(),
      setTokenVerified: vi.fn()
    });
    return null;
  }
  const view = await mountView(() => h(Workspace));
  await act(async () => browser.actions.loadEvents('autumn-finals'));
  expect(transport.notice).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: i18n.t('errors:startgg.publicUnavailable'),
      color: 'red'
    })
  );
  await view.unmount();
});

it('keeps standalone games independent, follows loaded events in both generators, and refreshes artwork on return', async () => {
  await i18n.changeLanguage('en');
  vi.useFakeTimers();
  const folderChecks = vi.fn(async (_url: string, init?: RequestInit) => {
    expect(init?.headers).toMatchObject({ 'X-JABS-Action': 'renderer-v1' });
    return new Response(JSON.stringify({ created: 0, rosterAvailable: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  });
  vi.stubGlobal('fetch', folderChecks);
  transport.prepare.mockImplementation(transport.nativePrepare!);

  transport.identity.mockImplementation(async (subjects: unknown[]) => ({ matches: subjects.map(() => ({})) }));
  transport.games.mockRejectedValueOnce(new Error('Catalog unavailable')).mockResolvedValue({
    cached: false,
    games: [
      { id: '1', name: 'Street Fighter 6' },
      { id: '2', name: 'Samurai Shodown' },
      { id: '73221', name: 'Fatal Fury: City of the Wolves' },
      { id: '987', name: '侍魂' },
      ...Array.from({ length: 120 }, (_, i) => ({ id: String(200000 + i), name: `Fighter ${i}` }))
    ]
  });
  const events = vi
    .fn()
    .mockResolvedValue({ events: [{ id: 'event', name: 'Singles', videogame: { id: '4', name: 'Invincible VS' } }] });
  let browser!: ReturnType<typeof useBracketBrowser>;
  let streamMatch: typeof activeSet | undefined;
  const noop = () => undefined;
  function Workspace() {
    browser = useBracketBrowser({
      startgg: {
        events,
        phases: async () => ({ phases: [] }),
        sets: async () => ({ sets: [] }),
        streamQueue: async () => ({ assignments: [] })
      } as unknown as StartggGateway,
      setMessage: noop,
      setLoading: noop,
      setTokenVerified: noop
    });
    return h(
      MantineProvider,
      { env: 'test' },
      h(StartggPanel, {
        keyboardShortcuts: { enabled: false, setEnabled: noop },
        tokenInputRef: { current: null },
        tokenConfigured: false,
        tokenStorageAvailable: false,
        tokenSessionOnly: false,
        tokenVerified: false,
        tokenInputReady: false,
        bracket: browser,
        profiles,
        logos: [],
        countries: [],
        loading: false,
        reloadingAssets: false,
        reloadSelectedSetDisabled: true,
        unloadTournamentDisabled: false,
        assetCatalogRevision: 0,
        moderationRevision: 0,
        activeSet: streamMatch,
        onReloadAssets: noop,
        onTokenInputReady: noop,
        onSaveToken: noop,
        onRemoveToken: noop,
        onReloadSelectedSet: noop,
        onCustomScoreboard: noop,
        onMessage: noop,
        onModerationApplied: noop,
        onCopy: noop
      })
    );
  }
  const view = await mountView(() => h(Workspace));
  async function tab(key: 'topEight' | 'thumbnail' | 'bracket') {
    const button = [...view.container.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === i18n.t(`operator:workspaces.${key}`)
    );
    await act(async () => {
      (button as HTMLElement).click();
      await vi.advanceTimersByTimeAsync(300);
    });
  }
  function gameInput() {
    const label = [...view.container.querySelectorAll('label')].find((label) => label.textContent === 'Game');
    expect(label).toBeDefined();
    return document.getElementById(label!.htmlFor) as HTMLInputElement;
  }
  async function selectGame(name: string) {
    await act(async () => gameInput().click());
    const option = [...document.querySelectorAll('[role="option"]')].find((option) => option.textContent === name);
    expect(option).toBeDefined();
    if (name === 'Samurai Shodown') {
      const list = option!.closest('[role="listbox"]');
      expect(list?.querySelectorAll('[role="option"]').length).toBeGreaterThan(100);
    }
    await act(async () => {
      (option as HTMLElement).click();
      await vi.advanceTimersByTimeAsync(300);
    });
  }
  // Typing a tournament slug does not lock standalone selection.
  await act(async () => browser.actions.setTournamentSlug('not-loaded'));
  await tab('thumbnail');
  expect(gameInput().readOnly).toBe(false);
  await act(async () => gameInput().click());
  expect(view.container.textContent).toContain('Catalog unavailable');
  await act(async () => gameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await selectGame('Samurai Shodown');
  expect(view.container.querySelector('.thumbnail-canvas footer strong')?.textContent).toBe('Samurai Shodown');
  expect(transport.characters).toHaveBeenCalledWith('samurai-shodown');
  await tab('topEight');
  expect(gameInput().value).toBe('Street Fighter 6');
  await selectGame('Fatal Fury: City of the Wolves');
  expect(transport.games).toHaveBeenCalledTimes(2);
  expect(transport.characters).toHaveBeenCalledWith('fatal-fury-city-of-the-wolves');
  await tab('thumbnail');
  expect(gameInput().value).toBe('Samurai Shodown');
  const reads = transport.characters.mock.calls.length;
  const preparations = folderChecks.mock.calls.length;
  // Window-management focus events alone must not trigger asset work.
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(transport.characters).toHaveBeenCalledTimes(reads);
  expect(folderChecks).toHaveBeenCalledTimes(preparations);
  let finishPreparation!: () => void;
  const pendingPreparation = new Promise<void>((resolve) => {
    finishPreparation = resolve;
  });
  folderChecks.mockImplementation(async () => {
    await pendingPreparation;
    return new Response(JSON.stringify({ created: 0, rosterAvailable: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  });
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(view.container.textContent).not.toContain(i18n.t('operator:generators.preparingCharacters'));
  expect(transport.characters.mock.calls.length).toBeGreaterThan(reads);
  expect(folderChecks.mock.calls.length).toBeGreaterThan(preparations);
  const refreshedReads = transport.characters.mock.calls.length;
  await act(async () => finishPreparation());
  expect(transport.characters).toHaveBeenCalledTimes(refreshedReads);
  const afterFocus = folderChecks.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(folderChecks).toHaveBeenCalledTimes(afterFocus);
  // Loading a tournament binds both drafts to its selected event, including unsupported games.
  await act(async () => browser.actions.loadEvents('loaded-tournament'));
  expect(gameInput().readOnly).toBe(true);
  expect(gameInput().value).toBe('Invincible VS');
  expect(transport.characters).toHaveBeenCalledWith('invincible-vs');
  streamMatch = {
    ...activeSet,
    setId: 'new-stream-match',
    tournamentName: 'Funda Series: Grand Finals',
    tournamentSlug: 'funda-series-slug',
    gameId: 'tekken-8',
    gameName: 'Tekken 8',
    assetCatalogSlug: 'tekken-8'
  };
  await view.rerender();
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(view.container.querySelector('.thumbnail-canvas header span')?.textContent).toBe('Funda Series: Grand Finals');
  expect(view.container.querySelector('.thumbnail-canvas footer strong')?.textContent).toBe('Invincible VS');
  await tab('topEight');
  expect(gameInput().readOnly).toBe(true);
  expect(gameInput().value).toBe('Invincible VS');
  events.mockResolvedValueOnce({
    events: [
      { id: '1516201', name: 'Vampire Savior', videogame: { id: '582', name: 'Vampire Savior: The Lord of Vampire' } }
    ]
  });
  await act(async () => browser.actions.loadEvents('evo-2026'));
  await tab('bracket');
  const profileInput = () => view.container.querySelector<HTMLInputElement>('[data-testid="selection-game-profile"]')!;
  expect(profileInput().value).toBe('Street Fighter 6');
  expect(profileInput().disabled).toBe(false);
  expect(transport.characters).toHaveBeenCalledWith('vampire-savior-the-lord-of-vampire');
  await act(async () => browser.actions.setSelectionGameId('tekken-8'));
  expect(profileInput().value).toBe('Tekken 8');
  await tab('topEight');
  expect(gameInput().value).toBe('Vampire Savior: The Lord of Vampire');
  expect(transport.characters).toHaveBeenLastCalledWith('vampire-savior-the-lord-of-vampire');
  await act(async () => browser.actions.selectEvent(''));
  expect(gameInput().placeholder).toBe('Select an event first');
  expect(gameInput().readOnly).toBe(true);
  await act(async () => browser.actions.unloadTournament());
  expect(gameInput().readOnly).toBe(false);
  await selectGame('侍魂');
  expect(transport.characters).toHaveBeenCalledWith('startgg-game-987');
  expect(view.container.querySelector('.top8-canvas .top8-canvas-brand')?.textContent).toBe('侍魂');
  // A loaded tournament with no events still locks the selector.
  events.mockResolvedValueOnce({ events: [] });
  await act(async () => browser.actions.loadEvents('empty-tournament'));
  expect(gameInput().readOnly).toBe(true);
  await view.unmount();
}, 20_000);

it.each(['game', 'event'] as const)(
  'ignores a manual standings import after changing the selected %s',
  async (context) => {
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
    const pending = deferred<StartggEventStandingsResult>();
    transport.standingsBySlug.mockReturnValue(pending.promise);
    let controller!: ReturnType<typeof useTopEightDraft>;
    let selectedEventId: string | undefined;
    function Workspace() {
      controller = useTopEightDraft();
      return h(
        MantineProvider,
        { env: 'test' },
        h(TopEightGenerator, {
          controller,
          profiles,
          logos: [],
          countries: [],
          assetCatalogRevision: 0,
          moderationRevision: 0,
          selectedEventId
        })
      );
    }
    const view = await mountView(() => h(Workspace));
    await act(async () => controller.setTournamentName('Working graphic'));
    const input = view.container.querySelector<HTMLInputElement>(
      'input[placeholder="https://start.gg/tournament/.../event/..."]'
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'https://start.gg/tournament/example/event/singles'
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const button = [...view.container.querySelectorAll('button')].find(
      (button) => button.textContent === i18n.t('operator:topEight.loadEventUrl')
    )!;
    await act(async () => button.click());
    expect(transport.standingsBySlug).toHaveBeenCalledOnce();
    if (context === 'game') await act(async () => controller.setGameContext('tekken-8', 'Tekken 8', 'tekken-8'));
    else {
      selectedEventId = 'another-event';
      await view.rerender();
    }
    await act(async () =>
      pending.resolve({
        eventName: 'Old event',
        eventGameName: 'Street Fighter 6',
        finalized: true,
        standings: [1, 2, 3, 4, 5, 5, 7, 7].map((placement, index) => ({
          placement,
          name: `Finalist ${index + 1}`,
          isFinal: true
        }))
      })
    );
    expect(controller.draft.tournamentName).toBe('Working graphic');
    expect(controller.draft.entrants[0].name).toBe('Player 1');
    if (context === 'game') expect(controller.draft.assetCatalogSlug).toBe('tekken-8');
  }
);
