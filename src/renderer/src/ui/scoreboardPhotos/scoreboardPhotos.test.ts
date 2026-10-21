// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createTestOverlayState, createTestCustomScoreboard } from '@shared/testFixtures';
import type { LibraryPlayer } from '@shared/playerLibrary';
import type { SelectedSetState } from '@shared/models';
import {
  defaultHeadshotCrop,
  scoreboardPhotoLayout,
  scoreboardPhotoPlacement,
  scoreboardPhotoSettingsSchema,
  scoreboardPhotoSchema,
  type ScoreboardPhoto,
  type ScoreboardPhotoSettings
} from '@shared/scoreboardPhotos';
import { customScoreboardRegionIds } from '@shared/customScoreboards';
import { initializeI18n } from '../../i18n';
import { deferred, mountView } from '../../hooks/hookTestHarness';
import { invalidateCatalogConsumers } from '../../hooks/useCatalogRevision';
import { ScoreboardPlayerPhotos } from './ScoreboardPlayerPhotos';
import { CustomScoreboardCanvas } from '../CustomScoreboardCanvas';
import { PlayerHeadshotEditor } from '../players/PlayerHeadshotEditor';
import { ScoreboardPhotoControls } from './ScoreboardPhotoControls';

const transport = vi.hoisted(() => ({
  enabled: false,
  logoBackdrop: false,
  sponsorBackdrop: false,
  updatedAt: '1',
  save: vi.fn(),
  resolve: vi.fn(),
  headshot: vi.fn(),
  photo: vi.fn(),
  identity: vi.fn(),
  sponsor: vi.fn()
}));
vi.mock('../../hooks/useScoreboardPhotos', () => ({
  useScoreboardPhotos: () => ({
    state: { enabled: transport.enabled, logoBackdrop: transport.logoBackdrop, sponsorBackdrop: transport.sponsorBackdrop, updatedAt: transport.updatedAt },
    setState(next: ScoreboardPhotoSettings) {
      transport.enabled = next.enabled;
      transport.logoBackdrop = next.logoBackdrop;
      transport.sponsorBackdrop = next.sponsorBackdrop;
      transport.updatedAt = next.updatedAt;
    }
  })
}));
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      updateScoreboardPhotoSettings: transport.save,
      resolveScoreboardPhotos: transport.resolve,
      playerHeadshotAssetUrl: transport.headshot,
      playerPhotoAssetUrl: transport.photo,
      identityMedia: transport.identity,
      sponsorLogoAssetUrl: transport.sponsor
    }
  };
});
function photo(id: string): ScoreboardPhoto {
  return { source: 'headshot', assetId: `${id}.png`, fingerprint: '1234567890abcdef', crop: defaultHeadshotCrop() };
}
beforeAll(initializeI18n);
beforeEach(() => {
  transport.enabled = false;
  transport.logoBackdrop = false;
  transport.sponsorBackdrop = false;
  transport.updatedAt = '1';
  transport.save.mockReset().mockImplementation(async (settings) => ({ ...settings, updatedAt: '2' }));
  transport.resolve.mockReset().mockResolvedValue({ photos: [null, null] });
  transport.headshot.mockReset().mockImplementation(async (id: string) => `data:image/png;base64,${id}`);
  transport.photo.mockReset().mockImplementation(async (id: string) => `data:image/png;base64,${id}`);
  transport.identity.mockReset().mockResolvedValue({ matches: [{ sponsorLogoAssetId: 'one-square-logo.png' }, { sponsorLogoAssetId: 'two-wide-logo.png' }] });
  transport.sponsor.mockReset().mockImplementation(async (id: string) => `data:image/png;base64,${id}`);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      get naturalWidth() { return this.src.includes('padded-logo') ? 1080 : 600; }
      get naturalHeight() {
        if (this.src.includes('padded-logo')) return 1080;
        if (this.src.includes('near-square-logo')) return 480;
        if (this.src.includes('square-logo')) return 600;
        if (this.src.includes('wide-')) return 200;
        return 900;
      }
      async decode() {
        if (this.src.includes('broken')) throw new Error('Bad image');
      }
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    let padded = false;
    let unreadable = false;
    let empty = false;
    return {
      drawImage(image: HTMLImageElement) {
        padded = image.src.includes('padded-logo');
        unreadable = image.src.includes('unreadable');
        empty = image.src.includes('empty-logo');
      },
      getImageData(_x: number, _y: number, width: number, height: number) {
        if (unreadable) throw new Error('Pixel access unavailable');
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (!empty && (!padded || (x >= 47 && x < 215 && y >= 5 && y < 248))) data[(y * width + x) * 4 + 3] = 255;
          }
        }
        return { data };
      }
    } as unknown as CanvasRenderingContext2D;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('does no photo work while disabled and uses placeholders for missing or failed photos when enabled', async () => {
  const selectedSet = createTestOverlayState('2xko').selectedSet;
  selectedSet.broadcast = {
    infoBarEnabled: false,
    ...selectedSet.broadcast,
    logoEnabled: false,
    logoAssetId: 'event.png'
  };
  const logoUrl = 'data:image/png;base64,wide-event-logo';
  expect(scoreboardPhotoSettingsSchema.parse({ enabled: true, updatedAt: '1' }).logoBackdrop).toBe(false);
  expect(scoreboardPhotoSettingsSchema.parse({ enabled: true, updatedAt: '1' }).sponsorBackdrop).toBe(false);
  expect(scoreboardPhotoSettingsSchema.safeParse({ enabled: true, logoBackdrop: true, sponsorBackdrop: true, updatedAt: '1' }).success).toBe(false);
  const pending = deferred<{ photos: Array<ScoreboardPhoto | null> }>();
  transport.resolve.mockReturnValue(pending.promise);
  const view = await mountView(() => h(ScoreboardPlayerPhotos, { selectedSet, logoUrl }));
  expect(transport.resolve).not.toHaveBeenCalled();
  expect(transport.identity).not.toHaveBeenCalled();
  expect(view.container.querySelector('svg')).toBeNull();
  transport.enabled = true;
  await view.rerender();
  expect(view.container.querySelectorAll('[data-placeholder=true]')).toHaveLength(2);
  await act(async () => pending.resolve({ photos: [photo('one'), photo('broken')] }));
  expect(view.container.querySelectorAll('[data-placeholder=true]')).toHaveLength(1);
  const left = view.container.querySelector('[data-scoreboard-photo-side=left]')!;
  expect(left.querySelector('image')?.getAttribute('href')).toContain('one.png');
  expect(left.querySelector('mask path')?.getAttribute('d')).toBe(scoreboardPhotoLayout(selectedSet)!.sides.left.path);
  expect(scoreboardPhotoLayout(selectedSet)?.maskId).toBe('2xko-player-photo');
  expect(view.container.querySelector('[data-scoreboard-photo-logo]')).toBeNull();
  await act(async () => left.querySelector('image')!.dispatchEvent(new Event('error')));
  expect(view.container.querySelectorAll('[data-placeholder=true]')).toHaveLength(2);
  const controls = await mountView(() =>
    h(MantineProvider, { env: 'test' }, h(ScoreboardPhotoControls, { selectedSet }))
  );
  const logoSwitch = () =>
    [...controls.container.querySelectorAll<HTMLInputElement>('input')].find((input) =>
      input.closest('.mantine-Checkbox-root')?.textContent?.includes('Tournament logo behind players')
    )!;
  expect(logoSwitch().checked).toBe(false);
  await act(async () => logoSwitch().click());
  expect(transport.save).toHaveBeenCalledWith({ enabled: true, logoBackdrop: true, sponsorBackdrop: false, updatedAt: '1' });
  await view.rerender();
  const logos = [...view.container.querySelectorAll('[data-scoreboard-photo-logo]')];
  expect(logos).toHaveLength(2);
  for (const [index, logo] of logos.entries()) {
    expect(logo.getAttribute('href')).toBe(logoUrl);
    expect(logo.getAttribute('opacity')).toBe('0.14');
    const angle = Number(logo.getAttribute('transform')!.match(/^rotate\(([-\d.]+)/)![1]);
    expect(Math.sign(angle)).toBe(index === 0 ? 1 : -1);
    const [, , width, height] = scoreboardPhotoLayout(selectedSet)!.sides[index === 0 ? 'left' : 'right'].bounds;
    expect(Math.tan((Math.abs(angle) * Math.PI) / 180)).toBeCloseTo(height / width);
    expect(logo.parentElement?.getAttribute('mask')).toMatch(/^url\(#.+-photo\)$/);
    expect(logo.previousElementSibling?.hasAttribute('data-scoreboard-photo-background')).toBe(true);
    expect(logo.nextElementSibling?.tagName.toLowerCase()).toBe('svg');
  }
  for (const gameId of ['street-fighter-6', 'guilty-gear-strive', 'ultimate-marvel-vs-capcom-3'] as const) {
    const gameSet = { ...selectedSet, gameId, assetCatalogSlug: gameId };
    const nearSquare = gameId === 'guilty-gear-strive';
    const padded = gameId === 'street-fighter-6';
    const bounds = padded ? { x: 47 / 256, y: 5 / 256, width: 168 / 256, height: 243 / 256 }
      : { x: 0, y: 0, width: 1, height: 1 };
    const squareLogoUrl = `data:image/png;base64,${padded ? 'padded-logo' : nearSquare ? 'near-square-logo' : 'square-logo'}`;
    await view.rerender(() => h(ScoreboardPlayerPhotos, { selectedSet: gameSet, logoUrl: squareLogoUrl }));
    for (const side of ['left', 'right'] as const) {
      const logo = view.container.querySelector(`[data-scoreboard-photo-side=${side}] [data-scoreboard-photo-logo]`)!;
      const [x, y, width, height] = scoreboardPhotoLayout(gameSet)!.sides[side].bounds;
      expect(logo.getAttribute('transform')).toBeNull();
      const logoWidth = Number(logo.getAttribute('width'));
      const logoHeight = Number(logo.getAttribute('height'));
      expect(logoWidth / logoHeight).toBeCloseTo(nearSquare ? 1.25 : 1);
      const visibleWidth = logoWidth * bounds.width;
      const visibleHeight = logoHeight * bounds.height;
      expect(Number(logo.getAttribute('x')) + logoWidth * bounds.x + visibleWidth / 2).toBeCloseTo(x + width / 2);
      expect(Number(logo.getAttribute('y')) + logoHeight * bounds.y + visibleHeight / 2).toBeCloseTo(y + height / 2);
      expect(visibleWidth + 0.001).toBeGreaterThanOrEqual(width);
      expect(visibleHeight + 0.001).toBeGreaterThanOrEqual(height);
    }
  }
  for (const value of ['wide-logo', 'wide-unreadable-logo', 'wide-empty-logo', 'broken-logo']) {
    await view.rerender(() => h(ScoreboardPlayerPhotos, { selectedSet, logoUrl: `data:image/png;base64,${value}` }));
    for (const side of ['left', 'right'] as const) {
      const logo = view.container.querySelector(`[data-scoreboard-photo-side=${side}] [data-scoreboard-photo-logo]`)!;
      const [, , width, height] = scoreboardPhotoLayout(selectedSet)!.sides[side].bounds;
      expect(Number(logo.getAttribute('width'))).toBeCloseTo(Math.hypot(width, height) * 0.9);
      expect(Number(logo.getAttribute('height'))).toBeCloseTo(Math.min(width, height) * 0.84);
    }
  }
  expect(transport.resolve).toHaveBeenCalledTimes(1);
  const sponsorSwitch = () => [...controls.container.querySelectorAll<HTMLInputElement>('input')].find((input) =>
    input.closest('.mantine-Checkbox-root')?.textContent?.includes('Sponsor logos behind players'))!;
  await act(async () => sponsorSwitch().click());
  expect(transport.save).toHaveBeenLastCalledWith({ enabled: true, logoBackdrop: false, sponsorBackdrop: true, updatedAt: '2' });
  await controls.rerender();
  expect(logoSwitch().checked).toBe(false);
  expect(sponsorSwitch().checked).toBe(true);
  await act(async () => logoSwitch().click());
  expect(transport.save).toHaveBeenLastCalledWith({ enabled: true, logoBackdrop: true, sponsorBackdrop: false, updatedAt: '2' });
  await controls.rerender();
  expect(sponsorSwitch().checked).toBe(false);
  await view.rerender(() => h(ScoreboardPlayerPhotos, { selectedSet }));
  expect(view.container.querySelector('[data-scoreboard-photo-logo]')).toBeNull();
  await act(async () => logoSwitch().click());
  expect(transport.save).toHaveBeenLastCalledWith({ enabled: true, logoBackdrop: false, sponsorBackdrop: false, updatedAt: '2' });
  selectedSet.broadcast = { ...selectedSet.broadcast!, logoAssetId: undefined };
  await controls.rerender();
  expect(logoSwitch().disabled).toBe(true);
  expect(controls.container.textContent).toContain('Choose a tournament logo in Broadcast extras.');
  transport.enabled = false;
  await view.rerender();
  expect(view.container.querySelector('svg')).toBeNull();
  transport.enabled = true;
  const calls = transport.resolve.mock.calls.length;
  const smash = {
    ...createTestOverlayState('super-smash-bros-ultimate').selectedSet,
    stylingGameId: 'street-fighter-6' as const
  };
  await view.rerender(() => h(ScoreboardPlayerPhotos, { selectedSet: smash, logoUrl }));
  expect(scoreboardPhotoLayout(smash)).toBeUndefined();
  expect(view.container.querySelector('svg')).toBeNull();
  expect(transport.resolve).toHaveBeenCalledTimes(calls);
});

it('keeps identities through swaps and late loads without reloading media for scores, styling, or game geometry', async () => {
  transport.enabled = true;
  transport.resolve.mockResolvedValue({ photos: [photo('one'), photo('two')] });
  let selectedSet = createTestOverlayState().selectedSet;
  const view = await mountView(() => h(ScoreboardPlayerPhotos, { selectedSet }));
  expect(transport.resolve).toHaveBeenCalledTimes(1);
  const originalPath = view.container.querySelector('mask path')!.getAttribute('d');
  const originalColors = [...view.container.querySelectorAll('linearGradient stop')].map((stop) =>
    stop.getAttribute('stop-color')
  );
  selectedSet = { ...selectedSet, stylingGameId: 'tekken-8', playerOne: { ...selectedSet.playerOne, score: 1 } };
  await view.rerender();
  expect(transport.resolve).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector('mask path')!.getAttribute('d')).toBe(originalPath);
  expect(view.container.querySelector('[stroke], [stroke-width], [stop-opacity]')).toBeNull();
  const styledColors = [...view.container.querySelectorAll('linearGradient stop')].map((stop) =>
    stop.getAttribute('stop-color')
  );
  expect(styledColors).not.toEqual(originalColors);
  expect(styledColors.slice(0, 2)).toEqual(styledColors.slice(2));
  expect(styledColors[1]).toContain('#30d5ff');
  const pending = deferred<{ photos: Array<ScoreboardPhoto | null> }>();
  transport.resolve
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({ photos: [photo('new-one'), photo('new-two')] });
  selectedSet = { ...selectedSet, playerOne: selectedSet.playerTwo, playerTwo: selectedSet.playerOne };
  await view.rerender();
  expect(view.container.querySelectorAll('[data-placeholder=true]')).toHaveLength(0);
  expect(view.container.querySelector('[data-scoreboard-photo-side=left] image')?.getAttribute('href')).toContain(
    'two.png'
  );
  expect(view.container.querySelector('[data-scoreboard-photo-side=right] image')?.getAttribute('href')).toContain(
    'one.png'
  );
  selectedSet = { ...selectedSet, playerOne: { ...selectedSet.playerOne, name: 'Next match' } };
  await view.rerender();
  await act(async () => pending.resolve({ photos: [photo('stale-one'), photo('stale-two')] }));
  expect(view.container.querySelector('image')?.getAttribute('href')).toContain('new-one.png');
  expect(view.container.innerHTML).not.toContain('stale-one.png');
  const calls = transport.resolve.mock.calls.length;
  selectedSet = {
    ...selectedSet,
    gameId: 'ultimate-marvel-vs-capcom-3',
    assetCatalogSlug: 'ultimate-marvel-vs-capcom-3'
  };
  await view.rerender();
  expect(transport.resolve).toHaveBeenCalledTimes(calls);
  expect(scoreboardPhotoLayout(selectedSet)?.maskId).toBe('ultimate-marvel-vs-capcom-3-side-photo');
  const refresh = deferred<{ photos: Array<ScoreboardPhoto | null> }>();
  const decoded = deferred<void>();
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 600;
      naturalHeight = 900;
      async decode() {
        if (this.src.includes('refreshed')) await decoded.promise;
        if (this.src.includes('broken')) throw new Error('Bad image');
      }
    }
  );
  transport.resolve.mockReturnValueOnce(refresh.promise);
  const leftPhoto = () => view.container.querySelector('[data-scoreboard-photo-side=left] image')?.getAttribute('href');
  await act(async () => invalidateCatalogConsumers());
  expect(transport.resolve).toHaveBeenCalledTimes(calls + 1);
  expect(view.container.querySelectorAll('[data-placeholder=true]')).toHaveLength(0);
  expect(leftPhoto()).toContain('new-one.png');
  await act(async () => refresh.resolve({ photos: [photo('refreshed'), photo('new-two')] }));
  expect(leftPhoto()).toContain('new-one.png');
  expect(view.container.querySelectorAll('[data-placeholder=true]')).toHaveLength(0);
  await act(async () => decoded.resolve());
  expect(leftPhoto()).toContain('refreshed.png');
  transport.resolve.mockRejectedValueOnce(new Error('Connection interrupted'));
  await act(async () => invalidateCatalogConsumers());
  expect(leftPhoto()).toContain('refreshed.png');
  transport.resolve.mockResolvedValueOnce({ photos: [photo('broken'), photo('new-two')] });
  await act(async () => invalidateCatalogConsumers());
  expect(leftPhoto()).toContain('refreshed.png');
  transport.resolve.mockResolvedValueOnce({ photos: [null, photo('new-two')] });
  await act(async () => invalidateCatalogConsumers());
  expect(view.container.querySelectorAll('[data-placeholder=true]')).toHaveLength(1);
  expect(leftPhoto()).not.toContain('refreshed.png');
  const next = deferred<{ photos: Array<ScoreboardPhoto | null> }>();
  transport.resolve.mockReturnValueOnce(next.promise);
  selectedSet = { ...selectedSet, playerTwo: { ...selectedSet.playerTwo, name: 'New player without a photo' } };
  await view.rerender();
  expect(view.container.querySelectorAll('[data-placeholder=true]')).toHaveLength(2);
  expect(view.container.innerHTML).not.toContain('new-two.png');
  await act(async () => next.resolve({ photos: [null, null] }));
  selectedSet = { ...selectedSet, assetCatalogSlug: 'unsupported-game' };
  await view.rerender();
  expect(view.container.querySelector('svg')).toBeNull();
});

it('uses selected-game geometry in custom scoreboards without exposing photo regions to drag or keyboard editing', async () => {
  transport.enabled = true;
  transport.logoBackdrop = true;
  const scoreboard = createTestCustomScoreboard({ id: 'custom' });
  Object.assign(scoreboard.visibility, { flags: false, round: false, bottomRails: false });
  const selectedSet: SelectedSetState = { ...createTestOverlayState('2xko').selectedSet, stylingGameId: 'street-fighter-6' };
  const move = vi.fn();
  const view = await mountView(() =>
    h(CustomScoreboardCanvas, {
      scoreboard,
      frameUrl: 'frame.png',
      logoUrl: 'data:image/png;base64,custom-event-logo',
      selectedSet,
      editingRegion: 'playerOneName',
      onMoveRegion: move
    })
  );
  const photos = view.container.querySelector('.scoreboard-player-photos')!;
  expect(photos.querySelectorAll('[data-scoreboard-photo-side]')).toHaveLength(2);
  expect(photos.querySelectorAll('[data-scoreboard-photo-logo]')).toHaveLength(2);
  expect(photos.querySelector('path')?.getAttribute('d')).toBe(scoreboardPhotoLayout(selectedSet)!.sides.left.path);
  expect(photos.querySelector('[tabindex]')).toBeNull();
  expect(photos.querySelector('.custom-scoreboard-region')).toBeNull();
  expect(customScoreboardRegionIds.some((id) => /photo/i.test(id))).toBe(false);
  await act(async () => photos.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(move).not.toHaveBeenCalled();
  transport.logoBackdrop = false;
  transport.sponsorBackdrop = true;
  selectedSet.playerOne.prefix = 'Team One';
  selectedSet.playerTwo.prefix = 'Team Two';
  await view.rerender();
  expect(transport.identity).toHaveBeenLastCalledWith([
    { name: selectedSet.playerOne.name, prefix: 'Team One' },
    { name: selectedSet.playerTwo.name, prefix: 'Team Two' }
  ]);
  const logoFor = (side: string) => view.container.querySelector(`[data-scoreboard-photo-side=${side}] [data-scoreboard-photo-logo]`);
  expect(logoFor('left')?.getAttribute('href')).toContain('one-square-logo.png');
  expect(logoFor('right')?.getAttribute('href')).toContain('two-wide-logo.png');
  const layout = scoreboardPhotoLayout(selectedSet)!;
  const [, , leftWidth, leftHeight] = layout.sides.left.bounds;
  const [, , rightWidth, rightHeight] = layout.sides.right.bounds;
  expect(logoFor('left')?.getAttribute('transform')).toBeNull();
  expect(Number(logoFor('left')?.getAttribute('width'))).toBeGreaterThanOrEqual(leftWidth);
  expect(Number(logoFor('left')?.getAttribute('height'))).toBeGreaterThanOrEqual(leftHeight);
  expect(Number(logoFor('right')?.getAttribute('width'))).toBeCloseTo(Math.hypot(rightWidth, rightHeight) * 0.9);
  const rightAngle = Number(logoFor('right')?.getAttribute('transform')?.match(/^rotate\(([-\d.]+)/)?.[1]);
  expect(rightAngle).toBeLessThan(0);
  expect(Math.tan((-rightAngle * Math.PI) / 180)).toBeCloseTo(rightHeight / rightWidth);
  for (const side of ['left', 'right']) {
    expect(logoFor(side)?.getAttribute('opacity')).toBe('0.14');
    expect(logoFor(side)?.parentElement?.getAttribute('mask')).toMatch(/^url\(#.+-photo\)$/);
  }
  const reads = transport.identity.mock.calls.length;
  selectedSet.playerOne.score = 1;
  selectedSet.stylingGameId = 'guilty-gear-strive';
  await view.rerender();
  expect(transport.identity).toHaveBeenCalledTimes(reads);
  await act(async () => invalidateCatalogConsumers());
  expect(transport.identity).toHaveBeenCalledTimes(reads + 1);
  transport.identity.mockResolvedValueOnce({ matches: [{}, { sponsorLogoAssetId: 'two-wide-logo.png' }] });
  selectedSet.playerOne.prefix = 'No matching logo';
  await view.rerender();
  expect(logoFor('left')).toBeNull();
  expect(logoFor('right')?.getAttribute('href')).toContain('two-wide-logo.png');
  const late = deferred<{ matches: Array<{ sponsorLogoAssetId: string }> }>();
  transport.identity.mockReturnValueOnce(late.promise);
  selectedSet.playerOne.prefix = 'Changed team';
  await view.rerender();
  transport.sponsorBackdrop = false;
  transport.logoBackdrop = true;
  await view.rerender();
  await act(async () => late.resolve({ matches: [{ sponsorLogoAssetId: 'stale.png' }] }));
  expect(logoFor('left')?.getAttribute('href')).toBe('data:image/png;base64,custom-event-logo');
  expect(logoFor('right')?.getAttribute('href')).toBe('data:image/png;base64,custom-event-logo');
  await view.rerender(() =>
    h(CustomScoreboardCanvas, {
      scoreboard,
      frameUrl: 'frame.png',
      logoUrl: 'data:image/png;base64,custom-event-logo',
      selectedSet: {
        ...selectedSet,
        gameId: 'super-smash-bros-ultimate',
        assetCatalogSlug: 'super-smash-bros-ultimate'
      }
    })
  );
  expect(view.container.querySelector('.scoreboard-player-photos')).toBeNull();
});

it('reuses drag, keyboard, resize and flip controls and keeps framing separate for each game and side', async () => {
  transport.resolve.mockResolvedValue({ photos: [{ ...photo('one'), fingerprint: 'abcdef1234567890' }] });
  let current: LibraryPlayer = {
    localId: '1'.repeat(32),
    playerId: null,
    imported: {
      name: 'One',
      prefix: null,
      xHandle: null,
      pronouns: null,
      country: null,
      state: null,
      profileSlug: null
    },
    overrides: {},
    aliases: [],
    games: [],
    updatedAt: '',
    seenAt: '',
    scoreboardPhoto: { ...photo('one'), crop: { x: 0.2, y: 0.4, zoom: 2 } }
  };
  const changed = vi.fn((next: ScoreboardPhoto | null) => {
    current = { ...current, scoreboardPhoto: next };
  });
  let gameKey = '2xko';
  const view = await mountView(() =>
    h(
      MantineProvider,
      {},
      h(PlayerHeadshotEditor, {
        player: current,
        gameKey,
        selectedSet: createTestOverlayState('2xko').selectedSet,
        onChange: changed
      })
    )
  );
  expect(view.container.textContent).toContain('This image changed.');
  expect(changed).not.toHaveBeenCalled();
  expect(view.container.querySelector('[role=combobox]')).toBeNull();
  const button = [...view.container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Use current image'
  )!;
  await act(async () => button.click());
  expect(current.scoreboardPhoto!.fingerprint).toBe('abcdef1234567890');
  expect(current.scoreboardPhoto!.crop).toEqual({ x: 0.2, y: 0.4, zoom: 2 });
  await view.rerender();
  expect(view.container.textContent).not.toContain('This image changed.');
  const reset = [...view.container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Reset framing'
  )!;
  await act(async () => reset.click());
  expect(current.scoreboardPhoto!.crop).toEqual({ x: 0.2, y: 0.4, zoom: 2 });
  expect(scoreboardPhotoPlacement(current.scoreboardPhoto!, '2xko', 'left')).toEqual({
    x: 0,
    y: 0,
    scale: 1,
    flipped: false
  });
  await view.rerender();
  expect(view.container.querySelectorAll('.headshot-framing-preview')).toHaveLength(1);
  expect(view.container.querySelector('[role=slider]')).toBeNull();
  const editable = () => view.container.querySelector<SVGGElement>('.keyboard-adjustable-media')!;
  async function press(key: string, shiftKey = false) {
    const before = editable().getAttribute('transform');
    await act(async () => {
      editable().dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
      editable().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await view.rerender();
    expect(editable().getAttribute('transform')).not.toBe(before);
  }
  await press('ArrowRight');
  await press('ArrowUp', true);
  await press('+');
  await press('f');
  const left = { ...current.scoreboardPhoto!.placements!['2xko'].left! };
  expect(left).toEqual({ x: 0.012, y: -0.05, scale: 1.04, flipped: true });
  await act(async () => view.container.querySelector<HTMLInputElement>('input[value=right]')!.click());
  await press('ArrowLeft');
  expect(current.scoreboardPhoto!.placements!['2xko'].left).toEqual(left);
  const legacySmash = scoreboardPhotoSchema.parse({
    ...current.scoreboardPhoto!,
    placements: {
      ...current.scoreboardPhoto!.placements,
      'super-smash-bros-ultimate': { left: { x: 0.2, y: 0.1, scale: 1.2, flipped: false } }
    }
  });
  expect(legacySmash.placements!['super-smash-bros-ultimate'].left!.scale).toBe(1.2);
  current = { ...current, scoreboardPhoto: legacySmash };
  gameKey = 'super-smash-bros-ultimate';
  await view.rerender();
  expect(view.container.querySelector('.headshot-framing-preview')).toBeNull();
  expect(view.container.textContent).toContain('No scoreboard photo layout is available for this game.');
  expect(current.scoreboardPhoto!.placements!['2xko'].right!.x).toBe(-0.012);
  const resolvedCalls = transport.resolve.mock.calls.length;
  gameKey = 'street-fighter-6';
  await view.rerender();
  await press('-');
  expect(current.scoreboardPhoto!.placements!['street-fighter-6'].right!.scale).toBe(0.96);
  expect(current.scoreboardPhoto!.placements!['2xko'].left).toEqual(left);
  expect(transport.resolve).toHaveBeenCalledTimes(resolvedCalls);
  const preview = view.container.querySelector<SVGSVGElement>('.headshot-framing-preview')!;
  vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 100 } as DOMRect);
  const target = editable();
  target.setPointerCapture = vi.fn();
  target.hasPointerCapture = () => true;
  target.releasePointerCapture = vi.fn();
  await act(async () => {
    target.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 20, clientY: 20, bubbles: true })
    );
    target.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 40, clientY: 30, bubbles: true }));
    target.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
  });
  expect(current.scoreboardPhoto!.placements!['street-fighter-6'].right).toEqual({
    x: 0.2,
    y: 0.1,
    scale: 0.96,
    flipped: false
  });
  expect(current.scoreboardPhoto!.placements!['2xko'].left).toEqual(left);
});
