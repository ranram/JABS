// @vitest-environment happy-dom
import noFlag from '../renderer/src/assets/Flag_of_None.webp';
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import { createTestOverlayState } from '@shared/testFixtures';
import type { OverlayMediaMatches, OverlayState } from '@shared/models';
import {
  historyForMatch,
  versusHistoryMatch,
  versusScreenStateSchema,
  type VersusScreenState
} from '@shared/versusScreen';
import { mountView } from '../renderer/src/hooks/hookTestHarness';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { VersusOverlay, VersusPresentation } from '../renderer/src/ui/VersusOverlay';
import { VersusScreenControls } from '../renderer/src/ui/operator/VersusScreenControls';
import playerPlaceholder from '../renderer/src/assets/player_placeholder.svg';
import type { SubjectMedia } from '../renderer/src/ui/useVersusMedia';

const transport = vi.hoisted(() => ({
  state: undefined as OverlayState | undefined,
  settings: undefined as VersusScreenState | undefined,
  playerMedia: vi.fn(async (): Promise<OverlayMediaMatches> => ({
    playerOne: { playerPhotoAssetId: 'alpha.png', sponsorLogoAssetId: 'team.png' },
    playerTwo: { playerPhotoAssetId: 'beta.png' }
  })),
  characters: vi.fn(async () => ({
    assets: [
      { character: 'Haohmaru', assetId: 'Haohmaru.png', variants: [] },
      { character: 'Nakoruru', assetId: 'Nakoruru.png', variants: [] }
    ]
  })),
  refreshHistory: vi.fn(),
  save: vi.fn(),
  resolve: vi.fn(async (): Promise<Array<{ age: number | null; nickname: string | null }>> => [
    { age: 27, nickname: 'The Champion' },
    { age: 30, nickname: 'The Challenger' }
  ])
}));

const logos = [
  { id: 'old-tournament.png', label: 'Previous tournament' },
  { id: 'exhibition.png', label: 'Exhibition' },
  { id: 'local.png', label: 'Local overlay' }
];
vi.mock('../renderer/src/hooks/useOverlayState', () => ({ useOverlayState: () => ({ state: transport.state }) }));
vi.mock('../renderer/src/hooks/useVersusScreenState', () => ({
  useVersusScreenState: () => ({ state: transport.settings })
}));
vi.mock('../renderer/src/api', () => ({
  api: {
    playerMedia: transport.playerMedia,
    resolvePlayers: transport.resolve,
    gameCharacterAssets: transport.characters,
    gameCharacterAssetUrl: async (_slug: string, id: string) => `data:image/png;base64,${id}`,
    playerPhotoAssetUrl: async (id: string) => `data:image/png;base64,${id}`,
    sponsorLogoAssetUrl: async (id: string) => `data:image/png;base64,${id}`,
    logos: async () => ({ logos }),
    logoAssetUrl: async (id: string) => `data:image/png;base64,${id}`,
    versusScreenState: async () => transport.settings,
    updateVersusScreenState: transport.save,
    refreshVersusHistory: transport.refreshHistory
  }
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('keeps optional comparisons paired, shows unknown values honestly, and keeps library metadata out of live edits', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  const set = createTestOverlayState('tekken-8').selectedSet;
  Object.assign(set, { setId: 'new-set', eventId: 'event', tournamentName: 'Major' });
  Object.assign(set.playerOne, { playerId: '1', prefix: 'ONE', seed: 17 });
  Object.assign(set.playerTwo, { playerId: '2', country: 'HN', prefix: 'TWO' });
  const settings = versusScreenStateSchema.parse({
    stylingGameId: 'tekken-8',
    mediaMode: 'photo',
    showTournamentLogo: true,
    showSponsorLogos: true,
    updatedAt: set.updatedAt
  });
  transport.resolve.mockResolvedValueOnce([
    { age: null, nickname: null },
    { age: 30, nickname: 'Challenger' }
  ]);
  let media: [SubjectMedia, SubjectMedia] = [{ sponsorUrl: 'one.png' }, {}];
  const view = await mountView(() => h(VersusPresentation, { selectedSet: set, settings, media, preview: true }));
  expect(view.container.querySelector('.versus-stat-age')?.textContent).toBe('—Age30');
  expect(view.container.querySelector('.versus-stat-seed')?.textContent).toBe('17Seed—');
  expect(view.container.querySelector('.versus-stat-nickname')).toBeNull();
  expect(view.container.querySelectorAll('.versus-player-sponsor-logo')).toHaveLength(0);
  expect(view.container.querySelector('.versus-identity-left')?.textContent).toBe(set.playerOne.name);
  expect(view.container.querySelector('.versus-identity-right')?.textContent).toBe(set.playerTwo.name);
  expect(view.container.querySelector('.versus-stat-sponsor')?.textContent).toBe('ONESponsorTWO');
  const ticker = (side: string) =>
    view.container.querySelector(`.versus-rail-${side} .versus-ticker`)?.getAttribute('aria-label');
  expect(ticker('left')).toBe('Major · Representing ONE · Seed 17');
  expect(ticker('right')).toBe('Major · Location Honduras · Age 30 · Representing TWO');
  for (const side of ['left', 'right']) {
    expect(view.container.querySelectorAll(`.versus-rail-${side} .versus-ticker-cycle`)).toHaveLength(2);
  }
  expect(view.container.querySelectorAll('.versus-country-flag')).toHaveLength(2);
  expect(view.container.querySelector('.versus-identity-left .versus-country-flag')?.getAttribute('src')).toBe(noFlag);
  expect(view.container.querySelector('.versus-identity-right .versus-country-flag')?.getAttribute('alt')).toBe('HN');
  expect(view.container.querySelectorAll('.versus-photo.is-placeholder')).toHaveLength(2);
  media[0].photoUrl = 'missing-photo.png';
  await view.rerender();
  const failedPhoto = view.container.querySelector<HTMLImageElement>('.versus-photo')!;
  await act(async () => failedPhoto.dispatchEvent(new Event('error')));
  expect(failedPhoto.getAttribute('src')).toBe(playerPlaceholder);
  expect(failedPhoto.classList.contains('is-placeholder')).toBe(true);
  media[0].photoUrl = 'replacement-photo.png';
  await view.rerender();
  expect(failedPhoto.getAttribute('src')).toBe('replacement-photo.png');
  expect(failedPhoto.classList.contains('is-placeholder')).toBe(false);
  settings.mediaMode = 'character';
  await view.rerender();
  expect(view.container.querySelector('.versus-photo, .versus-character')).toBeNull();
  settings.mediaMode = 'photo';
  const changePlacement = vi.fn();
  await view.rerender(() =>
    h(VersusPresentation, {
      selectedSet: set,
      settings,
      media,
      preview: true,
      onSelectLayer: () => {},
      onPlacementChange: changePlacement
    })
  );
  const editablePhoto = view.container.querySelector<HTMLImageElement>('.versus-photo')!;
  expect(editablePhoto.classList.contains('keyboard-adjustable-media')).toBe(true);
  expect(editablePhoto.hasAttribute('tabindex')).toBe(true);
  await act(async () => editablePhoto.dispatchEvent(new Event('error')));
  expect(editablePhoto.getAttribute('src')).toBe(playerPlaceholder);
  expect(editablePhoto.classList.contains('is-placeholder')).toBe(true);
  await act(async () => {
    editablePhoto.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    editablePhoto.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    editablePhoto.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    editablePhoto.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(changePlacement).toHaveBeenCalledWith(0, 'photo', { x: 0.012, y: 0, scale: 1.04, flipped: true });
  settings.mediaPlacements[0].photo = changePlacement.mock.calls.at(-1)![2];
  await view.rerender(() => h(VersusPresentation, { selectedSet: set, settings, media }));
  expect(view.container.querySelector<HTMLImageElement>('.versus-photo')?.style.transform).toBe(
    'translate3d(11.52px, 0px, 0) scale(1.04) scaleX(-1)'
  );
  expect(view.container.querySelector('.versus-photo')?.getAttribute('data-entrance')).toBe('image-left');
  changePlacement.mockClear();
  await view.rerender(() =>
    h(VersusPresentation, {
      selectedSet: set,
      settings,
      media,
      preview: true,
      onSelectLayer() {},
      onPlacementChange: changePlacement
    })
  );
  settings.mediaMode = 'combined';
  settings.mediaPlacements[0].character = { x: 0.2, y: 0.1, scale: 1.3, flipped: true };
  settings.mediaPlacements[0].photo = { x: 0.5, y: 0.5, scale: 2, flipped: true };
  media[0].characterUrl = 'character.png';
  await view.rerender();
  const layers = view.container.querySelector('.versus-player-left .player-media-layers')!;
  expect([...layers.querySelectorAll('img')].map((image) => image.classList.contains('versus-photo'))).toEqual([
    false,
    true
  ]);
  expect(layers.querySelector('.versus-character')?.classList.contains('keyboard-adjustable-media')).toBe(true);
  expect(layers.querySelector<HTMLImageElement>('.versus-character')?.style.transform).toContain(
    'scale(1.3) scaleX(-1)'
  );
  expect(layers.querySelector('.versus-photo')?.classList.contains('keyboard-adjustable-media')).toBe(true);
  expect(layers.querySelector<HTMLImageElement>('.versus-photo')?.style.transform).toBe(
    'translate3d(25cqw, 28.125cqw, 0) scale(2) scaleX(-1)'
  );
  await act(async () => {
    const artwork = layers.querySelector('.versus-character')!;
    artwork.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    artwork.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(changePlacement).toHaveBeenCalledTimes(1);
  expect(changePlacement).toHaveBeenCalledWith(0, 'character', {
    x: expect.closeTo(0.212),
    y: 0.1,
    scale: 1.3,
    flipped: true
  });
  await view.rerender(() => h(VersusPresentation, { selectedSet: set, settings, media }));
  expect(view.container.querySelector<HTMLImageElement>('.versus-character')?.style.transform).toContain(
    'translate3d(192px, 108px, 0) scale(1.3) scaleX(-1)'
  );
  expect(view.container.querySelector('.versus-photo')?.getAttribute('data-entrance')).toBe('photo-left');
  expect(view.container.querySelector<HTMLImageElement>('.versus-photo')?.style.transform).toBe(
    'translate3d(480px, 540px, 0) scale(2) scaleX(-1)'
  );
  expect(transport.resolve).toHaveBeenCalledTimes(1);
  media = [{ sponsorUrl: 'one.png' }, { sponsorUrl: 'two.png' }];
  await view.rerender();
  expect(
    view.container
      .querySelector('.versus-stat-sponsor > .versus-stat-value:first-child > .versus-player-sponsor-logo')
      ?.getAttribute('src')
  ).toBe('one.png');
  expect(
    view.container
      .querySelector('.versus-stat-sponsor > .versus-stat-value:last-child > .versus-player-sponsor-logo')
      ?.getAttribute('src')
  ).toBe('two.png');
  expect(view.container.querySelectorAll('.versus-player-sponsor-logo')).toHaveLength(2);
  settings.showSponsorLogos = false;
  settings.statRows = ['seed', 'age'];
  await view.rerender();
  expect(view.container.querySelector('.versus-player-sponsor-logo')).toBeNull();
  expect(ticker('left')).toBe('Major · Seed 17');
  delete set.playerTwo.prefix;
  delete set.playerTwo.sponsor;
  settings.statRows = ['sponsor', 'seed'];
  await view.rerender();
  expect(ticker('right')).toBe('Major · Location Honduras');
  expect(view.container.querySelector('.versus-stat-sponsor')?.textContent).toBe('ONESponsor—');
  delete set.tournamentName;
  settings.statRows = ['age'];
  await view.rerender();
  expect(ticker('left')).toBeUndefined();
  expect(ticker('right')).toBe('Location Honduras · Age 30');
  expect(set.playerOne).not.toHaveProperty('age');
  expect(set.playerTwo).not.toHaveProperty('nickname');
  await view.unmount();
});

beforeEach(async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  transport.playerMedia.mockResolvedValue({
    playerOne: { playerPhotoAssetId: 'alpha.png', sponsorLogoAssetId: 'team.png' },
    playerTwo: { playerPhotoAssetId: 'beta.png' }
  });
  transport.characters.mockResolvedValue({
    assets: [
      { character: 'Haohmaru', assetId: 'Haohmaru.png', variants: [] },
      { character: 'Nakoruru', assetId: 'Nakoruru.png', variants: [] }
    ]
  });
});

it('presents exhibitions in OBS and preview while preserving media through score and appearance edits', async () => {
  const { view, exhibition, assertCards, historyButton } = await mountExhibition();
  assertCards('First to 7');
  const backdropSwitch = () => {
    const label = [...view.container.querySelectorAll('label')].find((label) =>
      label.textContent?.startsWith('Match information backdrop')
    )!;
    return document.getElementById(label.htmlFor) as HTMLInputElement;
  };
  expect(backdropSwitch().checked).toBe(true);
  expect(view.container.querySelector('.versus-center-card.is-without-backdrop')).toBeNull();
  await act(async () => backdropSwitch().click());
  await view.rerender();
  expect(transport.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ showMatchBackdrop: false, showBackground: true })
  );
  expect(view.container.querySelectorAll('.versus-center-card.is-without-backdrop')).toHaveLength(2);
  expect(view.container.querySelectorAll('.versus-stat-sponsor')).toHaveLength(2);
  await act(async () => backdropSwitch().click());
  await view.rerender();
  expect(view.container.querySelector('.versus-center-card.is-without-backdrop')).toBeNull();
  expect(view.container.querySelector('.versus-match-logo')).toBeNull();
  expect(historyButton()?.disabled).toBe(true);
  const reads = transport.playerMedia.mock.calls.length;
  const catalogs = transport.characters.mock.calls.length;
  transport.state = {
    selectedSet: { ...exhibition, playerOne: { ...exhibition.playerOne, score: 4 }, matchFormat: 'topanga' }
  };
  await view.rerender();
  assertCards('Topanga Rules');
  expect(transport.playerMedia).toHaveBeenCalledTimes(reads);
  expect(transport.characters).toHaveBeenCalledTimes(catalogs);
  transport.state.selectedSet = { ...transport.state.selectedSet, round: 'Main Event' };
  await view.rerender();
  for (const title of view.container.querySelectorAll('.versus-match-title'))
    expect(title.textContent).toBe('Main Event');
  expect(transport.playerMedia).toHaveBeenCalledTimes(reads);
  transport.state.selectedSet.broadcast = { infoBarEnabled: false, logoEnabled: true, logoAssetId: 'exhibition.png' };
  transport.settings = { ...transport.settings!, showBackground: false, mediaMode: 'photo' };
  await view.rerender();
  for (const overlay of view.container.querySelectorAll('.versus-overlay')) {
    expect(overlay.classList.contains('is-transparent-background')).toBe(true);
    expect(overlay.querySelector('.versus-match-logo')?.getAttribute('src')).toBe(
      'data:image/png;base64,exhibition.png'
    );
    expect(overlay.querySelector('.versus-match-logo')?.parentElement?.className).toBe('versus-logo-tab');
    expect(overlay.querySelector('.versus-photo')?.getAttribute('src')).toBe('data:image/png;base64,alpha.png');
    expect(overlay.querySelector('h1')?.textContent).toBe('Upcoming match');
  }
  expect(transport.playerMedia).toHaveBeenCalledTimes(reads);
  const logoInput = () => {
    const label = [...view.container.querySelectorAll('label')].find((label) => label.textContent === 'Logo')!;
    return document.getElementById(label.htmlFor) as HTMLInputElement;
  };
  await act(async () => logoInput().click());
  const localLogo = [...document.querySelectorAll('[role="option"]')].find(
    (option) => option.textContent === 'Local overlay'
  )!;
  await act(async () => (localLogo as HTMLElement).click());
  await view.rerender();
  expect(transport.save).toHaveBeenLastCalledWith(expect.objectContaining({ logoAssetId: 'local.png' }));
  transport.state.selectedSet.broadcast = {
    ...transport.state.selectedSet.broadcast!,
    logoAssetId: 'old-tournament.png'
  };
  await view.rerender();
  for (const logo of view.container.querySelectorAll('.versus-match-logo'))
    expect(logo.getAttribute('src')).toBe('data:image/png;base64,local.png');
  await act(async () => (view.container.querySelector('[aria-label="Use rails logo"]') as HTMLElement).click());
  await view.rerender();
  expect(transport.settings!.logoAssetId).toBeUndefined();
  for (const logo of view.container.querySelectorAll('.versus-match-logo'))
    expect(logo.getAttribute('src')).toBe('data:image/png;base64,old-tournament.png');
  transport.state.selectedSet.broadcast.logoAssetId = undefined;
  await view.rerender();
  expect(view.container.querySelector('.versus-match-logo')).toBeNull();
  expect(transport.playerMedia).toHaveBeenCalledTimes(reads);
});

it('shows tournament history only for the matching set and keeps it stable through score and language changes', async () => {
  const { view, fresh, exhibition, historyButton } = await mountExhibition();
  const loaded = await showTournamentHistory(view, exhibition);
  expect(historyButton()?.disabled).toBe(false);
  for (const overlay of view.container.querySelectorAll('.versus-overlay')) {
    expect(overlay.classList.contains('versus-exhibition')).toBe(false);
    expect(overlay.querySelector('.versus-history-grid')).toBeNull();
    expect(overlay.textContent).not.toContain('Weekly Finals');
    expect(overlay.querySelector('.versus-h2h')?.textContent).toContain('Previous Weekly');
    expect([...overlay.querySelectorAll('.versus-h2h-event small')].map((row) => row.textContent)).toEqual([
      'Top 8 · Winners Quarter-Final',
      'Top 8 · Winners Final',
      'Top 8 · Grand Final',
      'Top 8 · Grand Final Reset'
    ]);
    expect(overlay.querySelector('.versus-h2h h2')?.textContent).toBe('Head-to-head');
    expect(overlay.querySelector('.versus-h2h h2 strong')).toBeNull();
    expect(overlay.querySelector('.versus-h2h')?.textContent ?? '').not.toContain('Hidden Singles');
    expect(overlay.querySelector('.versus-rail-left .versus-ticker')?.getAttribute('aria-label')).toContain(
      'Current Major'
    );
    expect([...overlay.querySelectorAll('.versus-stat-row')].map((row) => row.getAttribute('data-stat'))).toEqual([
      'age',
      'sponsor',
      'seed',
      'nickname'
    ]);
    expect(overlay.querySelector('.versus-stat-age')?.textContent).toContain('27');
    expect(overlay.querySelector('.versus-stat-nickname')?.textContent).toContain('The Champion');
    expect(overlay.querySelectorAll('.versus-player-sponsor-logo')).toHaveLength(0);
  }
  const profileReads = transport.resolve.mock.calls.length;
  transport.settings = { ...transport.settings!, statRows: ['seed', 'age'], showHeadToHead: false };
  await view.rerender();
  for (const overlay of view.container.querySelectorAll('.versus-overlay')) {
    expect(overlay.querySelector('.versus-h2h')).toBeNull();
    expect([...overlay.querySelectorAll('.versus-stat-row')].map((row) => row.getAttribute('data-stat'))).toEqual([
      'seed',
      'age'
    ]);
  }
  expect(transport.resolve).toHaveBeenCalledTimes(profileReads);
  await act(async () => {
    await i18n.changeLanguage('es-419');
  });
  transport.settings = { ...transport.settings!, showHeadToHead: true };
  await view.rerender();
  expect([...view.container.querySelectorAll('.versus-h2h-outcome')].map((entry) => entry.textContent)).toEqual(
    Array(4)
      .fill(['W', 'L'])
      .flat()
      .concat(Array(4).fill(['W', 'L']).flat())
  );
  expect(view.container.querySelector('.versus-rail-left .versus-ticker')?.getAttribute('aria-label')).toContain(
    'Current Major · Ubicación Honduras · Edad 27'
  );
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  transport.settings = { ...transport.settings!, showHeadToHead: true };
  for (const changed of [
    { ...loaded, setId: 'other-set' },
    { ...loaded, eventId: 'other-event' },
    { ...loaded, videogameId: 'other-game' },
    { ...loaded, playerOne: loaded.playerTwo, playerTwo: loaded.playerOne },
    { ...loaded, playerTwo: { ...loaded.playerTwo, playerId: undefined } }
  ]) {
    transport.state = { selectedSet: changed };
    await view.rerender();
    for (const overlay of view.container.querySelectorAll('.versus-overlay')) {
      expect(overlay.querySelector('.versus-h2h')?.textContent ?? '').not.toContain('Previous Weekly');
    }
  }
  transport.state = { selectedSet: { ...loaded, playerOne: { ...loaded.playerOne, score: 1 } } };
  await view.rerender();
  expect(view.container.querySelector('.versus-h2h')?.textContent).toContain('Previous Weekly');
  // Old history can arrive after unloading. Neither the card nor reset state may display it.
  transport.state = { selectedSet: exhibition };
  await view.rerender();
  expect(historyButton()?.disabled).toBe(true);
  expect(view.container.querySelector('.versus-h2h')).toBeNull();
  transport.state = fresh;
  await view.rerender();
  expect(view.container.querySelector('.versus-player, .versus-match-vs')).toBeNull();
  expect(transport.refreshHistory).not.toHaveBeenCalled();
});

it('loads history for linked exhibitions and hides tournament-only seed controls', async () => {
  const { view, exhibition, historyButton } = await mountExhibition();
  const loaded = await showTournamentHistory(view, exhibition);
  // The current exhibition pair has linked profiles but no tournament or event.
  const linked = {
    ...exhibition,
    videogameId: '43868',
    assetCatalogSlug: 'street-fighter-6',
    gameName: 'Street Fighter 6',
    playerOne: { ...exhibition.playerOne, name: 'Alpha', playerId: '1', seed: 9 },
    playerTwo: { ...exhibition.playerTwo, name: 'Beta', playerId: '2', seed: 1 }
  };
  transport.state = { selectedSet: linked };
  await view.rerender();
  expect(view.container.querySelector('.versus-h2h')?.textContent ?? '').not.toContain('Previous Weekly');
  transport.settings = {
    ...transport.settings!,
    historyMatch: versusHistoryMatch(linked),
    historyLoading: true,
    statRows: ['age', 'sponsor', 'seed', 'nickname']
  };
  await view.rerender();
  expect(historyButton()?.disabled).toBe(false);
  for (const overlay of view.container.querySelectorAll('.versus-overlay')) {
    expect(overlay.querySelector('.versus-h2h [role=progressbar]')).not.toBeNull();
    expect(overlay.querySelector('.versus-stat-seed')).toBeNull();
    expect(overlay.querySelector('.versus-ticker')?.getAttribute('aria-label')).not.toContain('Seed');
  }
  transport.settings.historyLoading = false;
  await view.rerender();
  expect(view.container.querySelectorAll('.versus-h2h-row')).toHaveLength(8);
  const rowLabels = () =>
    [...view.container.querySelectorAll<HTMLLabelElement>('label')].filter((label) =>
      /^Row \d$/.test(label.textContent ?? '')
    );
  expect(rowLabels()).toHaveLength(3);
  await act(async () => document.getElementById(rowLabels()[0].htmlFor)!.click());
  const statOptions = [...document.querySelectorAll<HTMLElement>('[role=option]')];
  expect(statOptions.some((option) => option.textContent === 'Seed')).toBe(false);
  await act(async () => statOptions.find((option) => option.textContent === 'Sponsor')!.click());
  expect(transport.save).toHaveBeenLastCalledWith(
    expect.objectContaining({ statRows: ['sponsor', 'age', 'seed', 'nickname'] })
  );
  await view.rerender();
  await act(async () => historyButton()!.click());
  expect(transport.refreshHistory).toHaveBeenCalledOnce();
  for (const changed of [
    { ...linked, videogameId: '49783' },
    { ...linked, playerOne: linked.playerTwo, playerTwo: linked.playerOne },
    { ...linked, playerTwo: { ...linked.playerTwo, playerId: undefined } },
    { ...linked, playerTwo: { ...linked.playerTwo, playerId: linked.playerOne.playerId } }
  ]) {
    expect(historyForMatch(transport.settings!, changed)).toBeUndefined();
  }
  transport.state = { selectedSet: loaded };
  await view.rerender();
  expect(rowLabels()).toHaveLength(4);
  expect((document.getElementById(rowLabels()[2].htmlFor) as HTMLInputElement).value).toBe('Seed');
  await view.unmount();
});

function createExhibition() {
  const fresh = createTestOverlayState();
  delete fresh.selectedSet.assetCatalogSlug;
  transport.state = fresh;
  transport.settings = versusScreenStateSchema.parse({
    stylingGameId: 'street-fighter-6',
    showBackground: true,
    showTournamentLogo: true,
    showSponsorLogos: true,
    mediaMode: 'character',
    updatedAt: fresh.selectedSet.updatedAt
  });
  transport.save.mockImplementation(async (next: VersusScreenState) => {
    transport.settings = next;
    return next;
  });
  const exhibition = {
    ...fresh.selectedSet,
    assetCatalogSlug: 'samurai-shodown',
    videogameId: '334',
    gameName: 'Samurai Shodown',
    matchFormat: 'first-to' as const,
    bestOf: 13,
    round: 'Friday Exhibition',
    playerOne: {
      ...fresh.selectedSet.playerOne,
      name: 'Alpha',
      sponsor: 'Local Team',
      character: 'Haohmaru',
      country: 'hn'
    },
    playerTwo: { ...fresh.selectedSet.playerTwo, name: 'Beta', character: 'Nakoruru', country: 'jp' }
  };
  return { fresh, exhibition };
}

async function mountExhibition() {
  const { fresh, exhibition } = createExhibition();
  function Workspace() {
    return h(
      MantineProvider,
      { env: 'test' },
      h(VersusOverlay),
      h(VersusScreenControls, { activeSet: transport.state?.selectedSet, profiles: Object.values(gameProfiles), logos })
    );
  }
  const view = await mountView(() => h(Workspace));
  expect(view.container.querySelector('.versus-player')).toBeNull();
  expect(transport.playerMedia).not.toHaveBeenCalled();
  transport.state = { selectedSet: exhibition };
  await view.rerender();
  function assertCards(format: string) {
    const overlays = view.container.querySelectorAll('.versus-overlay');
    expect(overlays).toHaveLength(2);
    for (const overlay of overlays) {
      expect(overlay.classList.contains('versus-exhibition')).toBe(true);
      expect(overlay.querySelector('.versus-center-card')).not.toBeNull();
      expect(overlay.querySelector('h1')?.textContent).toBe('Upcoming match');
      expect(overlay.querySelector('.versus-match-game')?.textContent).toBe('Samurai Shodown');
      expect(overlay.querySelector('.versus-match-format')?.textContent).toBe(format);
      expect(overlay.querySelector('.versus-match-separator')?.textContent).toBe('·');
      expect(overlay.querySelector('.versus-match-title')?.textContent).toBe('Friday Exhibition');
      expect(overlay.querySelector('.versus-identity-left')?.textContent).toContain('Alpha');
      expect(overlay.querySelector('.versus-identity-left')?.textContent).not.toContain('Local Team');
      expect(overlay.querySelector('.versus-stat-sponsor')?.textContent).toContain('Local Team');
      expect(overlay.querySelectorAll('.versus-country-flag')).toHaveLength(2);
      expect(overlay.querySelector('.versus-identity-left .versus-country-flag')?.getAttribute('alt')).toBe('HN');
      expect(overlay.querySelector('.versus-identity-right .versus-country-flag')?.getAttribute('alt')).toBe('JP');
      expect(overlay.querySelector('img[src="data:image/png;base64,Haohmaru.png"]')).not.toBeNull();
      expect(overlay.querySelector('.versus-history-grid, .versus-h2h')).toBeNull();
    }
  }
  const historyButton = () =>
    [...view.container.querySelectorAll('button')].find(
      (button) => button.textContent === i18n.t('operator:workspaces.versusScreen.refreshHistory')
    );
  return { view, fresh, exhibition, assertCards, historyButton };
}

function tournamentSet(exhibition: ReturnType<typeof createExhibition>['exhibition']) {
  return {
    ...exhibition,
    setId: 'set',
    eventId: 'event',
    matchFormat: 'best-of' as const,
    bestOf: 3,
    playerOne: { ...exhibition.playerOne, playerId: 'one' },
    playerTwo: { ...exhibition.playerTwo, playerId: 'two' }
  };
}

async function showTournamentHistory(
  view: Awaited<ReturnType<typeof mountView>>,
  exhibition: ReturnType<typeof createExhibition>['exhibition']
) {
  const loaded = tournamentSet(exhibition);
  transport.state = { selectedSet: loaded };
  transport.settings = {
    ...transport.settings!,
    historyMatch: {
      setId: 'set',
      eventId: 'event',
      gameId: '334',
      playerOneId: 'one',
      playerTwoId: 'two'
    },
    history: {
      tournamentName: 'Current Major',
      playerOnePlacements: [{ placement: 1, tournamentName: 'Weekly Finals', eventName: 'Singles' }],
      playerTwoPlacements: [],
      headToHead: ['Winners Quarter-Final', 'Winners Final', 'Grand Final', 'Grand Final Reset'].map(
        (round, index) => ({
          setId: `${index}`,
          round,
          phase: 'Top 8',
          tournamentName: 'Previous Weekly',
          eventName: 'Hidden Singles',
          playerOneScore: 2,
          playerTwoScore: 1
        })
      )
    }
  };
  await view.rerender();
  return loaded;
}

it.each(['match', 'game', 'player'] as const)(
  'discards an unfinished image drag when the live %s changes',
  async (change) => {
    vi.useFakeTimers();
    const captures = new Set<number>();
    vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation((id) => {
      captures.add(id);
    });
    vi.spyOn(Element.prototype, 'hasPointerCapture').mockImplementation((id) => captures.has(id));
    vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation((id) => {
      captures.delete(id);
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 562.5));
    let selectedSet = createTestOverlayState().selectedSet;
    selectedSet.setId = 'first-match';
    const settings = versusScreenStateSchema.parse({
      stylingGameId: 'street-fighter-6',
      showTournamentLogo: false,
      showSponsorLogos: false,
      mediaMode: 'photo',
      updatedAt: selectedSet.updatedAt
    });
    const commit = vi.fn();
    const view = await mountView(() =>
      h(VersusPresentation, {
        selectedSet,
        settings,
        preview: true,
        media: [{ photoUrl: 'same.png' }, {}],
        onSelectLayer() {},
        onPlacementChange: commit
      })
    );
    const photo = view.container.querySelector('.versus-photo')!;
    await act(async () => {
      photo.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 100, bubbles: true }));
      photo.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 150, bubbles: true }));
    });
    if (change === 'match') selectedSet = { ...selectedSet, setId: 'second-match' };
    if (change === 'game') selectedSet = { ...selectedSet, assetCatalogSlug: 'tekken-8' };
    if (change === 'player')
      selectedSet = { ...selectedSet, playerOne: { ...selectedSet.playerOne, playerId: 'replacement' } };
    await view.rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(commit).not.toHaveBeenCalled();
    expect(view.container.querySelector('.versus-photo')).not.toBe(photo);
  }
);
