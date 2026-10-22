// @vitest-environment happy-dom
import noFlag from '../../assets/Flag_of_None.webp';
import { act, createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { playerStatsSchema, statsContext, type PlayerStats } from '@shared/playerStats';
import { createTestOverlayState } from '@shared/testFixtures';
import { deferred, mountView } from '../../hooks/hookTestHarness';
import { initializeI18n, i18n } from '../../i18n';
import { PlayerStatsOverlay } from './PlayerStatsOverlay';
import { StatsResults } from './StatsResults';
import { playerStatsSettingsSchema, type PlayerStatsSettings } from '@shared/playerStatsSettings';
import { displayFlagUrl } from '../overlayPlayerPresentation';
import questionMark from '../../assets/question-mark.svg';
import playerPlaceholder from '../../assets/player_placeholder.svg';

const transport = vi.hoisted(() => ({
  state: undefined as ReturnType<typeof createTestOverlayState> | undefined,
  settings: undefined as PlayerStatsSettings | undefined,
  stats: vi.fn(),
  logo: vi.fn(async (id: string) => `logo-${id}`),
  placementLogo: vi.fn(async (id: string) => `placing-${id}`)
}));
vi.mock('../../hooks/useOverlayState', () => ({ useOverlayState: () => ({ state: transport.state }) }));
vi.mock('../useVersusMedia', () => ({
  useVersusMedia: () => ({
    ready: true,
    media: [{ characterUrl: 'king', photoUrl: 'photo', sponsorUrl: 'sponsor' }, {}]
  })
}));
vi.mock('../../api', () => ({
  api: {
    playerStats: transport.stats,
    playerStatsSettings: async () => transport.settings,
    logoAssetUrl: transport.logo,
    statsTournamentLogoAssetUrl: transport.placementLogo
  },
  websocketUrl: async () => 'ws://127.0.0.1/ws',
  acceptCatalogMessage: () => false
}));
class Socket extends EventTarget {
  static instances: Socket[] = [];
  constructor() {
    super();
    Socket.instances.push(this);
  }
  close() {}
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
  Socket.instances = [];
});

it('selects either stream slot, shows five placing logos and the run, and never mixes players after switching', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  const state = createTestOverlayState('tekken-8');
  Object.assign(state.selectedSet, {
    eventId: 'event',
    videogameId: '49783',
    phase: 'Top 8',
    round: 'Losers Final',
    broadcast: { logoAssetId: 'tournament.png' }
  });
  Object.assign(state.selectedSet.playerOne, { name: 'MENARD', prefix: 'WBG', playerId: 'one', country: 'DO' });
  Object.assign(state.selectedSet.playerTwo, { name: 'KNEE', prefix: 'DRX', playerId: 'two', country: 'KR' });
  transport.state = state;
  transport.settings = playerStatsSettingsSchema.parse({ updatedAt: '2026-10-15T00:00:00Z' });
  function stats(slot: 1 | 2): PlayerStats {
    return playerStatsSchema.parse({
      context: statsContext(state.selectedSet, slot),
      tournamentName: 'Current Tournament',
      runScope: 'tournament',
      runComplete: true,
      placements: [1, 2, 3, 4, 7].map((id) => ({
        placement: id,
        tournamentName: `Tournament ${id}`,
        eventName: 'Singles',
        logoAssetId: `${id}`,
        numEntrants: 2048
      })),
      run: Array.from({ length: 10 }, (_, id) => ({
        id: `${id}`,
        opponent: `Opponent ${id}`,
        eventName: 'Singles',
        phase: 'Top 8',
        round: `Round ${id}`,
        outcome: id === 9 ? 'loss' : 'win',
        playerScore: 3,
        opponentScore: 1,
        playerDq: false,
        opponentDq: id === 0
      }))
    });
  }
  transport.stats.mockImplementation(async (slot: 1 | 2) => stats(slot));
  transport.placementLogo.mockRejectedValueOnce(new Error('Logo unavailable'));
  window.history.replaceState({}, '', '/overlay/active/stats?player=1');
  const view = await mountView(() => h(PlayerStatsOverlay));
  expect(view.container.querySelector('.victory-name')?.textContent).toBe('WBG MENARD');
  expect(view.container.querySelector('.stats-identity.has-flag > .stats-player-flag')).not.toBeNull();
  expect(view.container.querySelector('.stats-player-flag')?.nextElementSibling?.className).toBe('victory-name');
  expect(view.container.querySelector('.stats-player-context .stats-player-flag')).toBeNull();
  expect(view.container.querySelector('.stats-player-context')?.firstElementChild?.className).toContain(
    'stats-sponsor-logo'
  );
  expect(view.container.querySelector('.stats-player-flag')?.getAttribute('alt')).toBe('DO');
  expect(view.container.querySelector('.stats-player-flag')?.getAttribute('src')).toBe(displayFlagUrl('DO', undefined));
  expect(view.container.querySelectorAll('.stats-placement-list li')).toHaveLength(5);
  expect(view.container.querySelectorAll('.stats-placement-logo')).toHaveLength(5);
  expect(view.container.querySelector('.stats-placement-logo.is-placeholder')?.getAttribute('src')).toBe(questionMark);
  const secondLogo = view.container.querySelectorAll('.stats-placement-logo')[1];
  expect(secondLogo.getAttribute('src')).toBe('placing-2');
  await act(async () => secondLogo.dispatchEvent(new Event('error')));
  expect(secondLogo.getAttribute('src')).toBe(questionMark);
  await act(async () => view.container.querySelector('.victory-player-photo')!.dispatchEvent(new Event('error')));
  expect(view.container.querySelector('.victory-player-photo.is-placeholder')?.getAttribute('src')).toBe(
    playerPlaceholder
  );
  expect(view.container.querySelectorAll('.stats-run-list li')).toHaveLength(10);
  expect(view.container.querySelector('.stats-results')?.textContent).not.toContain('Singles');
  expect(view.container.querySelector('.stats-event-copy > span')).toBeNull();
  expect(view.container.querySelector('.stats-event-copy')?.textContent).toBe('Tournament 1');
  expect(view.container.querySelector('.stats-opponent > span')?.textContent).toBe('Top 8 · Round 0');
  expect(view.container.querySelector('.stats-set-score')?.textContent).toBe('3:DQ');
  expect(view.container.querySelector('.victory-logo')?.getAttribute('src')).toBe('logo-tournament.png');
  expect(view.container.querySelector('.stats-place')?.textContent).toBe('1st/2,048');
  expect(
    [...view.container.querySelectorAll('.stats-place')].map((element) => element.getAttribute('data-placement-tier'))
  ).toEqual(['gold', 'silver', 'bronze', 'platinum', 'platinum']);
  expect(view.container.querySelector('.victory-opening')).toBeNull();
  const calls = transport.stats.mock.calls.length;
  state.selectedSet.playerOne.score = 1;
  await view.rerender();
  expect(transport.stats.mock.calls.length).toBe(calls);
  state.selectedSet.round = 'Grand Final';
  state.selectedSet.winnersSideEntrantId = state.selectedSet.playerTwo.entrantId;
  await view.rerender();
  expect(view.container.querySelector('.victory-name')?.textContent).toBe('WBG MENARD [L]');
  state.selectedSet.round = 'Grand Final Reset';
  await view.rerender();
  expect(view.container.querySelector('.victory-name')?.textContent).toBe('WBG MENARD');
  expect(state.selectedSet.playerOne.name).toBe('MENARD');
  expect(transport.stats.mock.calls.length).toBe(calls);
  state.selectedSet.round = 'Losers Final';
  state.selectedSet.winnersSideEntrantId = undefined;

  state.selectedSet.playerOne.displayFlag = 'pride:transgender';
  await view.rerender();
  expect(view.container.querySelector('.stats-player-flag')?.getAttribute('alt')).toBe('Pride: Transgender');
  expect(view.container.querySelector('.stats-player-flag')?.getAttribute('src')).toBe(
    displayFlagUrl('DO', 'pride:transgender')
  );
  delete state.selectedSet.playerOne.displayFlag;
  delete state.selectedSet.playerOne.country;
  await view.rerender();
  expect(view.container.querySelector('.stats-player-flag')?.getAttribute('src')).toBe(noFlag);
  expect(view.container.querySelector('.stats-identity')?.classList.contains('has-flag')).toBe(true);
  expect(view.container.querySelector('.victory-name')?.textContent).toBe('WBG MENARD');
  expect(transport.stats.mock.calls.length).toBe(calls);

  async function settings(change: Partial<PlayerStatsSettings>) {
    transport.settings = { ...transport.settings!, ...change };
    await act(async () => {
      for (const socket of Socket.instances)
        socket.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify({ event: 'player-stats-settings', payload: transport.settings })
          })
        );
    });
  }
  const logoReads = transport.placementLogo.mock.calls.length;
  await settings({
    showBackground: false,
    showCharacter: false,
    showPlayerPhoto: false,
    showSponsorLogo: false,
    showPlacementLogos: false,
    logoAssetId: 'local.png',
    stylingGameId: 'street-fighter-6'
  });
  expect(view.container.querySelector('main')?.classList.contains('is-transparent-background')).toBe(true);
  expect(view.container.querySelector('main')?.classList.contains('theme-sf6')).toBe(true);
  expect(view.container.querySelector('.victory-character-art')).toBeNull();
  expect(view.container.querySelector('.victory-player-photo')).toBeNull();
  expect(view.container.querySelector('.stats-sponsor-logo')).toBeNull();
  expect(view.container.querySelectorAll('.stats-placement-logo.is-placeholder')).toHaveLength(5);
  expect(transport.placementLogo).toHaveBeenCalledTimes(logoReads);
  expect(view.container.querySelectorAll('.stats-placement-list li')).toHaveLength(5);
  expect(view.container.querySelectorAll('.stats-run-list li')).toHaveLength(10);
  expect(view.container.querySelector('.victory-logo')?.getAttribute('src')).toBe('logo-local.png');
  expect(transport.stats.mock.calls.length).toBe(calls);
  state.selectedSet.broadcast!.logoAssetId = 'new-rails.png';
  await view.rerender();
  expect(view.container.querySelector('.victory-logo')?.getAttribute('src')).toBe('logo-local.png');
  await settings({ logoAssetId: undefined, stylingGameId: undefined, showPlacementLogos: true });
  expect(view.container.querySelector('.victory-logo')?.getAttribute('src')).toBe('logo-new-rails.png');
  expect(view.container.querySelector('main')?.classList.contains('theme-t8')).toBe(true);
  await settings({ showTournamentLogo: false });
  expect(view.container.querySelector('.victory-logo')).toBeNull();
  expect(view.container.querySelectorAll('.stats-placement-logo')).toHaveLength(5);
  state.selectedSet.broadcast!.logoAssetId = undefined;
  await settings({ showTournamentLogo: true, logoAssetId: undefined });
  expect(view.container.querySelector('.victory-logo')).toBeNull();
  transport.logo.mockRejectedValueOnce(new Error('Logo unavailable'));
  await settings({ logoAssetId: 'missing.png' });
  expect(view.container.querySelector('.victory-logo')).toBeNull();
  const pendingLogo = deferred<string>();
  transport.logo.mockReturnValueOnce(pendingLogo.promise);
  await settings({ logoAssetId: 'next.png' });
  expect(view.container.querySelector('.victory-logo')).toBeNull();
  await act(async () => pendingLogo.resolve('logo-next.png'));
  const tournamentLogo = view.container.querySelector<HTMLImageElement>('.victory-logo')!;
  expect(tournamentLogo.getAttribute('src')).toBe('logo-next.png');
  await act(async () => tournamentLogo.dispatchEvent(new Event('error')));
  expect(tournamentLogo.style.display).toBe('none');
  expect(view.container.querySelector('.victory-logo.is-placeholder')).toBeNull();
  await act(async () => {
    await i18n.changeLanguage('es-419');
  });
  expect(view.container.querySelector('.stats-place')?.textContent).toBe('1ero/2,048');
  expect([...view.container.querySelectorAll('.stats-outcome')].map((node) => node.textContent)).toEqual([
    ...Array(9).fill('W'),
    'L'
  ]);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const second = deferred<PlayerStats>();
  transport.stats.mockReturnValue(second.promise);
  window.history.replaceState({}, '', '/overlay/active/stats?player=2');
  await view.rerender();
  expect(view.container.querySelector('.victory-name')?.textContent).toBe('DRX KNEE');
  expect(view.container.querySelector('.stats-player-flag')?.getAttribute('alt')).toBe('KR');
  expect(view.container.querySelector('.stats-player-flag')?.getAttribute('src')).toBe(displayFlagUrl('KR', undefined));
  expect(view.container.querySelectorAll('.stats-placement-list li')).toHaveLength(0);
  expect(view.container.textContent).toContain('Loading tournament results');
  await act(async () => {
    const nextStats = stats(2);
    nextStats.placements[4].logoAssetId = undefined;
    second.resolve(nextStats);
  });
  expect(view.container.querySelectorAll('.stats-placement-list li')).toHaveLength(5);
  expect(view.container.querySelectorAll('.stats-placement-logo')).toHaveLength(5);
  expect(
    view.container.querySelector('.stats-placement-list li:last-child .stats-placement-logo')?.getAttribute('src')
  ).toBe(questionMark);
  state.selectedSet.round = 'Grand Finals';
  state.selectedSet.winnersSideEntrantId = state.selectedSet.playerOne.entrantId;
  await view.rerender();
  expect(view.container.querySelector('.victory-name')?.textContent).toBe('DRX [L] KNEE');
  state.selectedSet.round = 'Grand Finals Reset';
  await view.rerender();
  expect(view.container.querySelector('.victory-name')?.textContent).toBe('DRX KNEE');
  expect(state.selectedSet.playerTwo.name).toBe('KNEE');
  await settings({ showPlayerPhoto: true });
  expect(view.container.querySelector('.victory-player-photo.is-placeholder')?.getAttribute('src')).toBe(
    playerPlaceholder
  );
  await settings({ showPlayerPhoto: false });
  expect(view.container.querySelector('.victory-player-photo')).toBeNull();
  delete state.selectedSet.playerTwo.playerId;
  transport.stats.mockResolvedValue({ ...stats(2), placements: [], run: [], runScope: 'event' });
  await view.rerender();
  expect(view.container.textContent).toContain('Link a start.gg player profile');
  expect(view.container.textContent).not.toContain('Link a start.gg profile to include the whole tournament');

  window.history.replaceState({}, '', '/overlay/active/stats?player=9');
  await view.rerender();
  expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('?player=1 or ?player=2');
});

it('pages through a long run and restarts the page timer when the player changes', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  vi.useFakeTimers();
  const snapshot = playerStatsSchema.parse({
    context: { entrantId: 'one', gameId: 'tekken-8' },
    placements: [],
    tournamentName: 'Major',
    runScope: 'tournament',
    runComplete: false,
    run: Array.from({ length: 19 }, (_, id) => ({
      id: `${id}`,
      opponent: `Opponent ${id}`,
      eventName: 'Singles',
      phase: 'Pools',
      round: 'Round 1',
      outcome: 'win',
      playerDq: false,
      opponentDq: false
    }))
  });
  const view = await mountView(() =>
    h(StatsResults, { stats: snapshot, loading: false, linked: true, tournament: true })
  );
  expect(view.container.querySelectorAll('.stats-run-list li')).toHaveLength(16);
  expect(view.container.textContent).toContain('Matches 1–16 of 19');
  expect(view.container.textContent).toContain('Some matches could not be loaded');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(12_000);
  });
  expect(view.container.querySelectorAll('.stats-run-list li')).toHaveLength(3);
  expect(view.container.textContent).toContain('Opponent 18');
  expect(view.container.textContent).toContain('Matches 17–19 of 19');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(11_000);
  });
  snapshot.context.entrantId = 'two';
  await view.rerender();
  expect(view.container.textContent).toContain('Matches 1–16 of 19');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(11_999);
  });
  expect(view.container.textContent).toContain('Matches 1–16 of 19');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.container.textContent).toContain('Matches 17–19 of 19');
  await view.unmount();
  vi.useRealTimers();
});
