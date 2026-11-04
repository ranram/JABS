// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { queueTickerSnapshotSchema, type QueueTickerSnapshot } from '@shared/queueTicker';
import { gameProfiles } from '@shared/gameProfiles';
import { initializeI18n } from '../../i18n';
import { mountView } from '../../hooks/hookTestHarness';
import { QueueTickerBar } from './QueueTicker';
import { QueueTickerControls } from './QueueTickerControls';

const transport = vi.hoisted(() => ({ current: vi.fn(), update: vi.fn(), liveStyle: 'tekken-8' }));
vi.mock('../../hooks/useOverlayState', () => ({
  useOverlayState: () => ({
    state: { selectedSet: { stylingGameId: transport.liveStyle, gameId: 'street-fighter-6' } }
  })
}));
vi.mock('../../hooks/useQueueTicker', () => ({
  queueTickerApi: transport,
  useQueueTicker: () => ({ state: undefined })
}));
vi.mock('../../hooks/useLogoAssetUrl', () => ({
  useLogoAssetUrl: (id?: string) => (id ? `/assets/tournament-logos/${id}` : undefined)
}));
vi.mock('../operator/useOperatorNotifications', () => ({ useOperatorNotifications: () => vi.fn() }));
beforeAll(() => initializeI18n());
afterEach(() => vi.useRealTimers());
function snapshot(): QueueTickerSnapshot {
  return {
    settings: {
      enabled: true,
      style: 'standard',
      upcomingCount: 2,
      showResults: true,
      showLogo: false,
      updatedAt: 'v1'
    },
    upcoming: [{ setId: 'next', playerOne: 'Alpha', playerTwo: 'Beta', phase: 'Top 8', round: 'Winners Final' }],
    results: [
      {
        setId: 'past',
        playerOne: 'Gamma',
        playerTwo: 'Delta',
        phase: 'Pools',
        round: 'Winners Round 2',
        scoreOne: 'W',
        scoreTwo: 'DQ',
        winner: 'one'
      }
    ]
  };
}
it('renders upcoming names and real results, and becomes transparent when disabled or empty', async () => {
  let state = snapshot();
  const legacySettings = { ...state.settings } as Partial<typeof state.settings>;
  delete legacySettings.style;
  expect(queueTickerSnapshotSchema.parse({ ...state, settings: legacySettings }).settings.style).toBe('compact');
  expect(
    queueTickerSnapshotSchema.safeParse({ ...state, settings: { ...state.settings, style: 'unknown' } }).success
  ).toBe(false);
  vi.useFakeTimers();
  const view = await mountView(() => h(QueueTickerBar, { state }));
  expect(
    view.container.querySelector('.queue-ticker-bar')?.classList.contains(gameProfiles['tekken-8'].overlay.themeClass)
  ).toBe(true);
  state.settings.stylingGameId = 'street-fighter-6';
  await view.rerender();
  expect(
    view.container
      .querySelector('.queue-ticker-bar')
      ?.classList.contains(gameProfiles['street-fighter-6'].overlay.themeClass)
  ).toBe(true);
  state.settings.stylingGameId = undefined;
  await view.rerender();
  expect(
    view.container.querySelector('.queue-ticker-bar')?.classList.contains(gameProfiles['tekken-8'].overlay.themeClass)
  ).toBe(true);
  expect(view.container.querySelector('.queue-ticker-lanes[data-cycle]')).not.toBeNull();
  expect(view.container.querySelector('.result-marker')).toBeNull();
  expect(view.container.textContent).toContain('Alpha');
  expect(view.container.querySelectorAll('.queue-ticker-matches[aria-hidden=true]')).toHaveLength(1);
  expect(view.container.textContent).toContain('Top 8 · Winners Final');
  expect(view.container.textContent).not.toContain('Gamma');
  await act(async () => vi.advanceTimersByTime(13499));
  expect(view.container.querySelector('[data-hold]')).toBeNull();
  await act(async () => vi.advanceTimersByTime(1));
  expect(view.container.querySelector('[data-hold]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(1499));
  expect(view.container.textContent).toContain('Alpha');
  await act(async () => vi.advanceTimersByTime(1));
  expect(view.container.textContent).not.toContain('Alpha');
  expect(view.container.textContent).toContain('Pools · Winners Round 2');
  expect(view.container.textContent).toContain('W – DQ');
  expect(
    [...view.container.querySelectorAll('.queue-ticker-matches:not([aria-hidden]) .result-marker')].map(
      (marker) => marker.textContent
    )
  ).toEqual(['W', 'DQ']);
  expect(
    view.container
      .querySelector('.queue-ticker-player[data-player-side="one"]')
      ?.firstElementChild?.classList.contains('result-marker')
  ).toBe(true);
  expect(
    view.container
      .querySelector('.queue-ticker-player[data-player-side="two"]')
      ?.lastElementChild?.classList.contains('result-marker')
  ).toBe(true);
  expect(view.container.querySelector('[data-winner]')?.textContent).toBe('Gamma');
  expect(view.container.querySelector('[data-hold]')).toBeNull();
  await act(async () => vi.advanceTimersByTime(13500));
  expect(view.container.querySelector('[data-hold]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(1500));
  expect(view.container.textContent).toContain('Alpha');
  state = { ...state, settings: { ...state.settings, style: 'compact' } };
  await view.rerender();
  await act(async () => vi.advanceTimersByTime(6999));
  expect(view.container.querySelector('[data-hold]')).toBeNull();
  await act(async () => vi.advanceTimersByTime(1));
  expect(view.container.querySelector('[data-hold]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(1500));
  expect(view.container.textContent).toContain('Gamma');
  state = { ...state, settings: { ...state.settings, showResults: false } };
  await view.rerender();
  expect(view.container.textContent).not.toContain('Gamma');
  expect(view.container.querySelector('[data-cycle]')).toBeNull();
  state = { ...state, settings: { ...state.settings, enabled: false } };
  await view.rerender();
  expect(view.container.querySelector('.queue-ticker-bar')).toBeNull();
  expect(
    queueTickerSnapshotSchema.safeParse({ ...state, settings: { ...state.settings, upcomingCount: 4 } }).success
  ).toBe(false);
});
it('persists count, results, and clearing the style override', async () => {
  const state = snapshot();
  state.settings.stylingGameId = 'street-fighter-6';
  transport.current.mockResolvedValue(state);
  transport.update.mockImplementation(async (settings) => ({ ...state, settings: { ...settings, updatedAt: 'v2' } }));
  const view = await mountView(() => h(MantineProvider, { env: 'test' }, h(QueueTickerControls, { logos: [] })));
  const slider = view.container.querySelector<HTMLElement>('[role=slider]')!;
  expect(slider.getAttribute('aria-valuemin')).toBe('1');
  expect(slider.getAttribute('aria-valuemax')).toBe('3');
  await act(async () => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(transport.update).toHaveBeenCalledWith(expect.objectContaining({ upcomingCount: 3 }));
  const results = [...view.container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find((node) =>
    node.closest('.mantine-Checkbox-root')
  )!;
  await act(async () => results.click());
  expect(transport.update).toHaveBeenLastCalledWith(expect.objectContaining({ showResults: false, upcomingCount: 3 }));
  const clearStyle = view.container.querySelector<HTMLButtonElement>('button[aria-label="Use live match style"]')!;
  expect(clearStyle).not.toBeNull();
  await act(async () => clearStyle.click());
  expect(transport.update).toHaveBeenLastCalledWith(expect.objectContaining({ stylingGameId: undefined }));
  expect(view.container.querySelector('input[placeholder="Use live match style"]')?.getAttribute('value')).toBe('');
});

it('keeps previews static and places the optional logo outside the moving match lanes', async () => {
  let state = snapshot();
  state.settings.style = 'compact';
  state.settings.stylingGameId = 'tekken-8';
  state.settings.showLogo = true;
  state.settings.logoAssetId = 'event.png';
  let previewLane: 'upcoming' | 'results' = 'upcoming';
  const view = await mountView(() => h(QueueTickerBar, { state, preview: true, previewLane }));
  const bar = view.container.querySelector<HTMLElement>('[data-style=compact]')!;
  expect(bar.classList.contains('theme-t8')).toBe(true);
  expect(view.container.textContent).toContain('Top 8 · Winners Final');
  expect(view.container.textContent).not.toContain('Gamma');
  expect(view.container.querySelector('[data-cycle]')).toBeNull();
  expect(view.container.querySelector('[data-animate]')).toBeNull();
  expect(view.container.querySelector('.queue-ticker-matches[aria-hidden=true]')).toBeNull();
  const logo = view.container.querySelector('.queue-ticker-logo img')!;
  expect(logo.getAttribute('src')).toBe('/assets/tournament-logos/event.png');
  expect(logo.closest('.queue-ticker-track')).toBeNull();
  expect(view.container.querySelectorAll('.queue-ticker-match')).toHaveLength(1);
  expect(view.container.querySelectorAll('.queue-ticker-match > .queue-ticker-divider')).toHaveLength(1);
  previewLane = 'results';
  await view.rerender();
  expect(view.container.textContent).toContain('Pools · Winners Round 2');
  expect(view.container.textContent).not.toContain('Alpha');
  expect(view.container.querySelector('.queue-ticker-logo img')).toBe(logo);
  state = { ...state, results: [{ ...state.results[0], winner: 'two', scoreOne: '2', scoreTwo: '3' }] };
  await view.rerender();
  expect([...view.container.querySelectorAll('.result-marker')].map((marker) => marker.textContent)).toEqual([
    'L',
    'W'
  ]);
  expect(view.container.querySelector('[data-winner]')?.textContent).toBe('Delta');
  state = { ...state, settings: { ...state.settings, showResults: false } };
  await view.rerender();
  expect(view.container.textContent).toContain('Alpha');
  expect(view.container.textContent).not.toContain('Gamma');
  state = { ...state, settings: { ...state.settings, showLogo: false } };
  await view.rerender();
  expect(view.container.querySelector('.queue-ticker-logo')).toBeNull();
});
