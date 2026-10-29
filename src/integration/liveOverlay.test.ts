// @vitest-environment happy-dom
import noFlag from '../renderer/src/assets/Flag_of_None.webp';
import { readFileSync } from 'node:fs';
import { act, createElement as h } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTestCustomScoreboard, createTestOverlayState } from '@shared/testFixtures';
import { commentatorStateSchema, type CommentatorState } from '@shared/commentators';
import { resultScreenStateSchema, type ResultScreenState } from '@shared/resultScreen';
import { topEightMatchupsStateSchema, type TopEightMatchupsState } from '@shared/topEightMatchups';
import type { GameCharacterAsset, OverlayState, PlayerMediaMatch } from '@shared/models';
import { deferred, mountView } from '../renderer/src/hooks/hookTestHarness';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { CustomScoreboardCanvas } from '../renderer/src/ui/CustomScoreboardCanvas';
import { OverlayView } from '../renderer/src/ui/OverlayView';
import { countryFlagUrl, displayFlagUrl } from '../renderer/src/ui/overlayPlayerPresentation';
import playerPlaceholder from '../renderer/src/assets/player_placeholder.svg';

const transport = vi.hoisted(() => ({
  overlay: undefined as OverlayState | undefined,
  commentators: undefined as CommentatorState | undefined,
  result: undefined as ResultScreenState | undefined,
  matchups: undefined as TopEightMatchupsState | undefined,
  characterAssets: vi.fn(async () => ({ assets: [] as GameCharacterAsset[] })),
  playerMedia: vi.fn(async () => ({ playerOne: {} as PlayerMediaMatch, playerTwo: {} as PlayerMediaMatch })),
  portraitUrl: vi.fn(async (_slug: string, id: string) => `data:image/png;base64,${id}`)
}));
vi.mock('../renderer/src/hooks/useOverlayState', () => ({ useOverlayState: () => ({ state: transport.overlay }) }));
vi.mock('../renderer/src/hooks/useCommentatorState', () => ({
  useCommentatorState: () => ({ state: transport.commentators })
}));
vi.mock('../renderer/src/hooks/useResultScreenState', () => ({
  useResultScreenState: () => ({ state: transport.result })
}));
vi.mock('../renderer/src/hooks/useTopEightMatchupsState', () => ({
  useTopEightMatchupsState: () => ({ state: transport.matchups })
}));
vi.mock('../renderer/src/hooks/useCustomScoreboard', () => ({ useCustomScoreboard: () => ({}) }));
vi.mock('../renderer/src/api', () => ({
  api: {
    playerMedia: transport.playerMedia,
    gameCharacterAssets: transport.characterAssets,
    gameCharacterPortraitUrl: transport.portraitUrl,
    gameCharacterAssetUrl: async (_slug: string, id: string) => `data:image/png;base64,${id}`,
    playerPhotoAssetUrl: async (id: string) => `data:image/png;base64,${id}`,
    sponsorLogoAssetUrl: async (id: string) => `data:image/png;base64,${id}`,
    logos: async () => ({ logos: ['rails.png', 'new-rails.png', 'local.png'].map((id) => ({ id, label: id })) }),
    logoAssetUrl: async (id: string) => `data:image/png;base64,${id}`
  }
}));

let originalPath: string;
beforeEach(() => {
  originalPath = window.location.pathname;
  transport.characterAssets.mockReset().mockResolvedValue({ assets: [] });
  transport.playerMedia.mockReset().mockResolvedValue({ playerOne: {}, playerTwo: {} });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.getElementById('live-overlay-test')?.remove();
  window.history.replaceState(null, '', originalPath);
});

it('uses an overlay logo when selected and falls back to the current rails logo', async () => {
  const { view, overlay } = await mountLiveOverlay();
  overlay.selectedSet.phase = ' pool ';
  await view.rerender();
  expect(view.container.querySelector('.overlay-match-context-rail')?.textContent).toContain('Pools');
  expect(view.container.textContent).not.toContain('Pool A1');
  expect(overlay.selectedSet.phase).toBe(' pool ');
  overlay.selectedSet.phase = 'Pool Stage';

  // Each OBS screen follows the rails logo until it has its own selection.
  for (const [path, selector, settings] of [
    ['/overlay/active/winner', '.announcement-tournament-logo', transport.result!],
    ['/overlay/active/champion', '.announcement-tournament-logo', transport.result!],
    ['/overlay/commentators', '.commentator-event-logo', transport.commentators!],
    ['/overlay/active/top-eight-matchups', '.top8-matchups-logo', transport.matchups!]
  ] as const) {
    if ('showTournamentLogo' in settings) settings.showTournamentLogo = true;
    settings.logoAssetId = undefined;
    overlay.selectedSet.broadcast = { ...overlay.selectedSet.broadcast!, logoAssetId: 'rails.png' };
    window.history.replaceState(null, '', path);
    await view.rerender(() => h(OverlayView));
    expect(view.container.querySelector(selector)?.getAttribute('src')).toBe('data:image/png;base64,rails.png');
    settings.logoAssetId = 'local.png';
    await view.rerender();
    expect(view.container.querySelector(selector)?.getAttribute('src')).toBe('data:image/png;base64,local.png');
    overlay.selectedSet.broadcast.logoAssetId = 'new-rails.png';
    await view.rerender();
    expect(view.container.querySelector(selector)?.getAttribute('src')).toBe('data:image/png;base64,local.png');
    settings.logoAssetId = undefined;
    await view.rerender();
    expect(view.container.querySelector(selector)?.getAttribute('src')).toBe('data:image/png;base64,new-rails.png');
    overlay.selectedSet.broadcast.logoAssetId = undefined;
    await view.rerender();
    expect(view.container.querySelector(selector)).toBeNull();
  }
});

it('shows tournament seeds only when enabled and hides exhibition seeds without deleting them', async () => {
  const { view, overlay } = await mountLiveOverlay();
  const set = overlay.selectedSet;
  const scoreboard = createTestCustomScoreboard();
  scoreboard.visibility.seeds = true;
  const custom = await mountView(() =>
    h(CustomScoreboardCanvas, {
      scoreboard,
      selectedSet: set,
      frameUrl: 'frame.png'
    })
  );
  const seedText = () => view.container.querySelector('.overlay-player-left .overlay-player-details')?.textContent;
  const customSeedText = () =>
    custom.container.querySelector('[data-custom-scoreboard-region="playerOneSeed"]')?.textContent;
  expect(seedText()).toBe('Seed 3');
  expect(customSeedText()).toBe('Seed 3');

  set.broadcast = { ...set.broadcast!, seedsEnabled: false };
  await view.rerender();
  await custom.rerender();
  expect(seedText()).toBeUndefined();
  expect(customSeedText()).toBeUndefined();
  expect(set.playerOne.seed).toBe(3);

  set.broadcast.seedsEnabled = true;
  await view.rerender();
  await custom.rerender();
  expect(seedText()).toBe('Seed 3');
  expect(customSeedText()).toBe('Seed 3');

  set.setId = undefined;
  await view.rerender();
  await custom.rerender();
  expect(seedText()).toBeUndefined();
  expect(customSeedText()).toBeUndefined();
  expect(set.playerOne.seed).toBe(3);
});

it('keeps Top 8 portrait slots blank while loading and refreshes only when their media changes', async () => {
  const { view } = await mountLiveOverlay();
  window.history.replaceState(null, '', '/overlay/active/top-eight-matchups');
  await view.rerender();
  // Keep portrait slots blank during loading, while names remain readable.
  const catalog = deferred<{ assets: GameCharacterAsset[] }>();
  transport.characterAssets.mockReturnValueOnce(catalog.promise);
  transport.matchups!.flipPlayerTwoPortraits = true;
  transport.matchups!.matchups.forEach(({ players }, index) => {
    players[0].character = index === 0 ? 'Ryu' : 'Akuma';
    players[1].character = 'Ken';
  });
  await view.rerender();
  expect(view.container.querySelector('.top8-matchup-character-fallback')).toBeNull();
  expect(view.container.querySelector('.top8-matchup-portrait img')).toBeNull();
  expect(view.container.querySelector('.top8-matchup-identity strong')?.textContent).toBe(
    transport.matchups!.matchups[0].players[0].name
  );
  await act(async () =>
    catalog.resolve({
      assets: [
        { character: 'Ryu', portraitAssetId: 'Ryu.png', variants: [] },
        { character: 'Ken', portraitAssetId: 'Ken.png', variants: [] }
      ]
    })
  );
  expect(view.container.querySelectorAll('.top8-matchup-portrait img')).toHaveLength(5);
  expect(view.container.querySelectorAll('.top8-matchup-character-fallback')).toHaveLength(3);
  expect(view.container.querySelector('.top8-matchup-player:nth-child(2) img')?.classList.contains('is-flipped')).toBe(
    true
  );
  const catalogReads = transport.characterAssets.mock.calls.length;
  transport.matchups!.updatedAt = '2026-10-12T00:00:00Z';
  transport.matchups!.flipPlayerTwoPortraits = false;
  await view.rerender();
  expect(transport.characterAssets).toHaveBeenCalledTimes(catalogReads);
});

it('loads only the current winner media and keeps it through composition and champion transitions', async () => {
  const { view, overlay } = await mountLiveOverlay();
  // Winner media waits for both catalogs and identity, without showing the previous result.
  const winnerCatalog = deferred<{ assets: GameCharacterAsset[] }>();
  const winnerIdentity = deferred<{ playerOne: PlayerMediaMatch; playerTwo: PlayerMediaMatch }>();
  transport.characterAssets.mockReturnValueOnce(winnerCatalog.promise);
  transport.playerMedia.mockReturnValueOnce(winnerIdentity.promise);
  transport.result!.showCharacter = true;
  transport.result!.showPlayerPhoto = true;
  transport.result!.showSponsorLogo = true;
  overlay.selectedSet.playerOne.score = 1;
  overlay.selectedSet.playerTwo.score = 2;
  overlay.selectedSet.playerTwo.character = 'Ken';
  window.history.replaceState(null, '', '/overlay/active/winner');
  await view.rerender(() => h(OverlayView));
  expect(view.container.querySelector('.announcement-subject-placeholder')).toBeNull();
  expect(view.container.querySelector('.announcement-character-art, .announcement-player-photo')).toBeNull();
  await act(async () => {
    winnerCatalog.resolve({ assets: [{ character: 'Ken', assetId: 'Ken.png', variants: [] }] });
    winnerIdentity.resolve({
      playerOne: { playerPhotoAssetId: 'first.png' },
      playerTwo: {
        playerPhotoAssetId: 'second.png',
        sponsorLogoAssetId: 'team.png'
      }
    });
  });
  expect(view.container.querySelector('.announcement-player-photo')?.getAttribute('src')).toBe(
    'data:image/png;base64,second.png'
  );
  await act(async () => view.container.querySelector('.announcement-player-photo')!.dispatchEvent(new Event('error')));
  expect(view.container.querySelector('.announcement-player-photo.is-placeholder')?.getAttribute('src')).toBe(
    playerPlaceholder
  );
  expect(view.container.querySelector('.announcement-character-art')?.getAttribute('src')).toBe(
    'data:image/png;base64,Ken.png'
  );
  expect(view.container.querySelector('.announcement-subject-placeholder')).toBeNull();
  const winnerReads = transport.playerMedia.mock.calls.length;
  const characterReads = transport.characterAssets.mock.calls.length;
  overlay.selectedSet.playerOne.score = 0;
  transport.result!.stylingGameId = 'tekken-8';
  await view.rerender();
  expect(transport.playerMedia).toHaveBeenCalledTimes(winnerReads);
  expect(transport.characterAssets).toHaveBeenCalledTimes(characterReads);
  const nextIdentity = deferred<{ playerOne: PlayerMediaMatch; playerTwo: PlayerMediaMatch }>();
  transport.playerMedia.mockReturnValueOnce(nextIdentity.promise);
  overlay.selectedSet.setId = 'next-result';
  overlay.selectedSet.playerOne.score = 2;
  overlay.selectedSet.playerTwo.score = 1;
  await view.rerender();
  expect(view.container.querySelector('.announcement-player-photo')?.getAttribute('src')).not.toBe(
    'data:image/png;base64,second.png'
  );
  expect(view.container.querySelector('.announcement-character-art')?.getAttribute('src')).not.toBe(
    'data:image/png;base64,Ken.png'
  );
  await act(async () => nextIdentity.resolve({ playerOne: {}, playerTwo: {} }));
  expect(view.container.querySelector('.announcement-player-photo.is-placeholder')?.getAttribute('src')).toBe(
    playerPlaceholder
  );

  // Both compositions share the public OBS source, media, and automatic result kind.
  const identityReads = transport.playerMedia.mock.calls.length;
  const resultCharacterReads = transport.characterAssets.mock.calls.length;
  const savedRound = overlay.selectedSet.round;
  overlay.selectedSet.stylingGameId = 'street-fighter-6';
  transport.result!.composition = 'victory';
  for (const path of ['/overlay/active/winner', '/overlay/active/champion']) {
    window.history.replaceState(null, '', path);
    await view.rerender();
    const result = view.container.querySelector('[data-announcement-surface="result"]')!;
    expect(result.getAttribute('data-announcement-composition')).toBe('victory');
    expect(result.classList.contains('theme-t8')).toBe(true);
    expect(view.container.querySelector('.victory-name')?.textContent).toContain(overlay.selectedSet.playerOne.name);
    expect(
      view.container.querySelector('.victory-player-photo.is-placeholder:not(.victory-shadow)')?.getAttribute('src')
    ).toBe(playerPlaceholder);
  }
  overlay.selectedSet.round = 'Grand Final Reset';
  transport.result!.showBackground = false;
  await view.rerender();
  expect(view.container.querySelector('.victory')?.getAttribute('data-announcement-kind')).toBe('champion');
  expect(view.container.querySelector('.victory')?.classList.contains('is-transparent-background')).toBe(true);
  transport.result!.composition = 'spotlight';
  await view.rerender();
  expect(view.container.querySelector('.spotlight')?.getAttribute('data-announcement-composition')).toBe('spotlight');
  expect(view.container.querySelector('.spotlight')?.getAttribute('data-announcement-kind')).toBe('champion');
  expect(view.container.querySelector('.spotlight')?.classList.contains('is-transparent-background')).toBe(true);
  expect(view.container.querySelector('.victory-band, .victory-impact')).toBeNull();
  expect(view.container.querySelector('.victory-opening')?.textContent).toBe('Champion');
  expect(view.container.querySelector('.victory-player-photo.is-placeholder')?.getAttribute('src')).toBe(
    playerPlaceholder
  );
  transport.result!.showPlayerPhoto = false;
  await view.rerender();
  expect(view.container.querySelector('.victory-player-photo')).toBeNull();
  transport.result!.showPlayerPhoto = true;
  transport.result!.composition = 'classic';
  await view.rerender();
  expect(view.container.querySelector('.announcement-copy')).not.toBeNull();
  expect(view.container.querySelector('.victory')).toBeNull();
  expect(transport.playerMedia).toHaveBeenCalledTimes(identityReads);
  expect(transport.characterAssets).toHaveBeenCalledTimes(resultCharacterReads);
  overlay.selectedSet.round = savedRound;
  transport.result!.showBackground = true;
});

it('renders bundled flags and falls back safely for invalid country selections', async () => {
  const { view, overlay } = await mountLiveOverlay();
  // Exercise the bundled flags through the scoreboard, including invalid selections.
  window.history.replaceState(null, '', '/overlay/active/main');
  overlay.selectedSet.playerOne.prefix = undefined;
  overlay.selectedSet.playerOne.sponsor = undefined;
  overlay.selectedSet.playerTwo.sponsor = undefined;
  await view.rerender(() => h(OverlayView));
  expect(view.container.querySelectorAll('.overlay-player-prefix')).toHaveLength(0);
  expect(view.container.querySelector('.overlay-player-left .overlay-player-name')?.textContent).toBe(
    overlay.selectedSet.playerOne.name
  );
  expect(view.container.querySelector('.overlay-player-right .overlay-player-name')?.textContent).toBe('Player 2');
  const originalRound = overlay.selectedSet.round;
  const originalStyling = overlay.selectedSet.stylingGameId;
  const originalPlayers = [overlay.selectedSet.playerOne, overlay.selectedSet.playerTwo] as const;
  const names = () => [...view.container.querySelectorAll('.overlay-player-name-text')].map((node) => node.textContent);
  for (const style of ['street-fighter-6', 'super-smash-bros-ultimate'] as const) {
    overlay.selectedSet.stylingGameId = style;
    for (const [round, winnersSide, loser] of [
      ['Grand Final', originalPlayers[0].entrantId, 1],
      ['Grand Finals', originalPlayers[1].entrantId, 0],
      ['  GRAND-FINALS  ', originalPlayers[0].entrantId, 1],
      ['Grand Final Reset', originalPlayers[0].entrantId, -1],
      ['Grand Finals Reset', originalPlayers[1].entrantId, -1],
      ['Winners Final', originalPlayers[0].entrantId, -1],
      ['Grand Final', undefined, -1],
      ['Grand Final', 'unknown-entrant', -1]
    ] as const) {
      overlay.selectedSet.round = round;
      overlay.selectedSet.winnersSideEntrantId = winnersSide;
      await view.rerender();
      expect(names()).toEqual([
        `${originalPlayers[0].name}${loser === 0 ? ' [L]' : ''}`,
        `${loser === 1 ? '[L] ' : ''}${originalPlayers[1].name}`
      ]);
    }
  }
  overlay.selectedSet.round = 'Grand Final';
  overlay.selectedSet.winnersSideEntrantId = originalPlayers[0].entrantId;
  [overlay.selectedSet.playerOne, overlay.selectedSet.playerTwo] = [originalPlayers[1], originalPlayers[0]];
  await view.rerender();
  expect(names()).toEqual([`${originalPlayers[1].name} [L]`, originalPlayers[0].name]);
  expect(originalPlayers.map((player) => player.name)).toEqual(['Player 1', 'Player 2']);
  [overlay.selectedSet.playerOne, overlay.selectedSet.playerTwo] = originalPlayers;
  overlay.selectedSet.round = originalRound;
  overlay.selectedSet.stylingGameId = originalStyling;
  overlay.selectedSet.winnersSideEntrantId = undefined;
  overlay.selectedSet.playerOne.displayFlag = 'pride:transgender';
  await view.rerender();
  expect(view.container.querySelector('.overlay-player-left .overlay-player-flag img')?.getAttribute('src')).toBe(
    displayFlagUrl('US', 'pride:transgender')
  );
  overlay.selectedSet.playerOne.displayFlag = undefined;
  overlay.selectedSet.playerOne.country = 'USA';
  await view.rerender();
  expect(countryFlagUrl('USA')).toBeUndefined();
  expect(view.container.querySelector('.overlay-player-left .overlay-player-flag img')?.getAttribute('src')).toBe(
    noFlag
  );
});

it('fits long scoreboard names in compact plates and restores their size when space increases', async () => {
  const { view, overlay } = await mountLiveOverlay();
  // Model a compact OBS plate, then a wider one, without relying on a browser layout engine.
  const fits = new Map<Element, () => void>();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: () => void) {}
      observe(element: Element) {
        fits.set(element, this.callback);
      }
      disconnect() {
        for (const [element, callback] of fits) if (callback === this.callback) fits.delete(element);
      }
    }
  );
  overlay.selectedSet.playerOne.name = 'あいう/ABC';
  overlay.selectedSet.playerOne.sponsor = 'TEAM';
  await view.rerender();
  const copy = view.container.querySelector<HTMLElement>('.overlay-player-left .overlay-player-copy')!;
  const identity = copy.querySelector<HTMLElement>('.overlay-player-identity')!;
  const text = copy.querySelector<HTMLElement>('.overlay-player-name')!;
  const metadata = copy.querySelector<HTMLElement>('.overlay-player-meta')!;
  // This DOM simulator does not resolve nested CSS math. Model the rendered
  // font in pixels alongside the plate measurements below.
  const computedStyle = getComputedStyle;
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => {
    const style = computedStyle(element);
    if (element !== text) return style;
    return new Proxy(style, {
      get(target, key) {
        return key === 'fontSize' ? text.style.fontSize || '20px' : Reflect.get(target, key, target);
      }
    });
  });
  const originalSize = Number.parseFloat(getComputedStyle(text).fontSize);
  let height = 32;
  let width = 130;
  let textWidth = 320;
  const scale = () => Number.parseFloat(getComputedStyle(text).fontSize) / originalSize;
  vi.spyOn(copy, 'clientHeight', 'get').mockImplementation(() => height);
  vi.spyOn(identity, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(text, 'scrollWidth', 'get').mockImplementation(() => Math.ceil(textWidth * scale()));
  const bounds = identity.getBoundingClientRect();
  vi.spyOn(identity, 'getBoundingClientRect').mockImplementation(() => ({ ...bounds, height: 32 * scale() + 2 }));
  vi.spyOn(metadata, 'getBoundingClientRect').mockReturnValue({ ...bounds, height: 10 });
  await act(async () => fits.get(copy)!());
  expect(text.scrollWidth).toBeLessThanOrEqual(width);
  expect(identity.getBoundingClientRect().height + 10 + 2).toBeLessThanOrEqual(height);
  expect(Number.parseFloat(text.style.fontSize)).toBeLessThan(originalSize);
  height = 64;
  width = 640;
  textWidth = 80;
  overlay.selectedSet.playerOne.name = 'Short';
  await view.rerender();
  expect(text.style.fontSize).toBe('');
});

async function mountLiveOverlay() {
  await initializeI18n();
  await i18n.changeLanguage('en');
  const styles = document.createElement('style');
  styles.id = 'live-overlay-test';
  styles.textContent = readFileSync('src/renderer/src/styles.css', 'utf8');
  document.head.append(styles);
  const overlay = createTestOverlayState();
  overlay.selectedSet.setId = 'set-1';
  overlay.selectedSet.phase = 'Pool Stage';
  overlay.selectedSet.phaseGroup = 'Pool A1';
  overlay.selectedSet.round = 'Winners Final';
  overlay.selectedSet.station = 'Station 3';
  overlay.selectedSet.playerTwo.sponsor = 'Team 2';
  overlay.selectedSet.playerOne = {
    ...overlay.selectedSet.playerOne,
    score: 2,
    country: 'US',
    seed: 3,
    character: 'Ryu'
  };
  transport.overlay = overlay;
  const updatedAt = overlay.selectedSet.updatedAt;
  transport.result = resultScreenStateSchema.parse({
    stylingGameId: 'street-fighter-6',
    showTournamentLogo: false,
    showPlayerPhoto: false,
    showSponsorLogo: false,
    showCharacter: false,
    updatedAt
  });
  window.history.replaceState(null, '', '/overlay/active/main');
  const view = await mountView(() => h(OverlayView));

  transport.commentators = commentatorStateSchema.parse({
    stylingGameId: 'street-fighter-6',
    tournamentName: 'Finals',
    showTournamentLogo: false,
    commentators: [
      { name: 'One', handle: '' },
      { name: 'Two', handle: '' }
    ],
    presentation: 'persistent',
    updatedAt
  });
  transport.matchups = topEightMatchupsStateSchema.parse({
    stylingGameId: 'street-fighter-6',
    assetCatalogSlug: 'street-fighter-6',
    tournamentName: 'Finals',
    showTournamentLogo: false,
    updatedAt,
    matchups: Array.from({ length: 4 }, (_, index) => ({
      bracket: index < 2 ? 'winners' : 'losers',
      players: [{ name: 'One' }, { name: 'Two' }]
    }))
  });
  return { view, overlay };
}
