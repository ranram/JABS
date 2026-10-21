// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { readFileSync } from 'node:fs';
import { MantineProvider } from '@mantine/core';
import { I18nextProvider } from 'react-i18next';
import { expect, it, vi } from 'vitest';
import {
  appearancePreferencesSchema,
  defaultAppearance,
  exportAppearance,
  parseAppearanceFile,
  type AppearancePreferences
} from '@shared/appearancePreferences';
import { bracketScreenStateSchema } from '@shared/bracketScreen';
import { gameProfiles } from '@shared/gameProfiles';
import type { OverlayState } from '@shared/models';
import { createTestOverlayState } from '@shared/testFixtures';
import {
  AppearanceProvider,
  useAppearance,
  useAppearanceStyle
} from '../renderer/src/ui/appearance/AppearanceProvider';
import { SettingsButton } from '../renderer/src/ui/appearance/SettingsPanel';
import { OverlayView } from '../renderer/src/ui/OverlayView';
import { BroadcastScoreboardFontSelect } from '../renderer/src/ui/fonts/BroadcastScoreboardFontSelect';
import { BracketPresentation } from '../renderer/src/ui/BracketScreen';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { mountView } from '../renderer/src/hooks/hookTestHarness';

const transport = vi.hoisted(() => ({
  state: undefined as AppearancePreferences | undefined,
  overlay: undefined as OverlayState | undefined,
  load: vi.fn(),
  save: vi.fn()
}));
vi.mock('../renderer/src/api', () => ({
  api: { appearancePreferences: transport.load, updateAppearancePreferences: transport.save },
  websocketUrl: async () => 'ws://127.0.0.1:4279/ws',
  acceptCatalogMessage: () => false
}));
vi.mock('../renderer/src/hooks/useOverlayState', () => ({ useOverlayState: () => ({ state: transport.overlay }) }));
vi.mock('../renderer/src/hooks/useLogoAssetUrl', () => ({ useLogoAssetUrl: () => undefined }));
vi.mock('../renderer/src/hooks/useScoreboardPhotos', () => ({
  useScoreboardPhotos: () => ({ state: { enabled: false, updatedAt: '1' } })
}));

it('shares appearance changes with broadcast previews and saves portable presets without changing operator language', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  transport.load.mockReset().mockImplementation(async () => transport.state);
  const originalPath = window.location.pathname;
  window.history.replaceState(null, '', '/overlay/active/main');
  const styles = document.createElement('style');
  styles.textContent =
    readFileSync('src/renderer/src/styles.css', 'utf8') +
    '\n' +
    readFileSync('src/renderer/src/ui/fonts/scoreboardFontOverride.css', 'utf8');
  document.head.append(styles);
  transport.overlay = createTestOverlayState();
  transport.overlay.selectedSet.broadcast = {
    infoBarEnabled: true,
    infoLeft: 'Stream',
    infoRight: 'Weekly',
    logoEnabled: false
  };
  const sockets: EventTarget[] = [];
  vi.stubGlobal(
    'WebSocket',
    class extends EventTarget {
      constructor() {
        super();
        sockets.push(this);
      }
      close() {}
    }
  );
  transport.state = appearancePreferencesSchema.parse({
    appearance: {},
    presets: [],
    operatorLanguage: 'en',
    updatedAt: '2026-10-13T00:00:00Z'
  });
  transport.save.mockImplementation(async (submitted: AppearancePreferences) => {
    expect(submitted.updatedAt).toBe(transport.state!.updatedAt);
    transport.state = appearancePreferencesSchema.parse({
      ...submitted,
      updatedAt: new Date(Date.parse(submitted.updatedAt) + 1).toISOString()
    });
    sockets.forEach((socket) =>
      socket.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ event: 'appearance-preferences', payload: transport.state })
        })
      )
    );
    return transport.state;
  });
  const bracket = bracketScreenStateSchema.parse({
    settings: {
      stylingGameId: 'tekken-8',
      scope: { eventId: '1', phaseId: '2', phaseGroupId: '3' },
      updatedAt: transport.state.updatedAt
    },
    snapshot: {
      scope: { eventId: '1', phaseId: '2', phaseGroupId: '3' },
      tournamentName: 'Weekly',
      eventName: 'Singles',
      phaseName: 'Top 8',
      groupName: '1',
      groupCount: 1,
      completed: false,
      fetchedAt: transport.state.updatedAt,
      matches: [1, -1].map((roundNumber) => ({
        id: String(roundNumber + 10),
        roundNumber,
        round: 'Original round name',
        state: 1,
        slots: [{}, {}]
      }))
    }
  });
  let settings: ReturnType<typeof useAppearance>;
  let customActive = false;
  function Preview() {
    settings = useAppearance();
    const style = useAppearanceStyle();
    return h(
      'div',
      {},
      h('output', { 'data-testid': 'palette', style }),
      h(BroadcastScoreboardFontSelect, { customActive, customFont: 'anton' }),
      h(OverlayView),
      h(BracketPresentation, { state: bracket, preview: true })
    );
  }
  const view = await mountView(() =>
    h(
      I18nextProvider,
      { i18n },
      h(
        MantineProvider,
        { env: 'test' },
        h(AppearanceProvider, { children: h('div', {}, h(SettingsButton), h(Preview)) })
      )
    )
  );
  const settingsButton = [...view.container.querySelectorAll('button')].find(
    (node) => node.textContent === 'Settings'
  )!;
  const fontLabel = [...view.container.querySelectorAll('label')].find(
    (node) => node.textContent === 'Scoreboard font'
  ) as HTMLLabelElement;
  const fontInput = document.getElementById(fontLabel.htmlFor) as HTMLInputElement;
  expect(fontInput.value).toBe('[DEFAULT]');
  async function chooseFont(name: string) {
    await act(async () => fontInput.click());
    const options = [
      ...document
        .getElementById(fontInput.getAttribute('aria-controls')!)!
        .querySelectorAll<HTMLElement>('[role="option"]')
    ];
    expect(options[0].textContent).toBe('[DEFAULT]');
    expect(options).toHaveLength(12);
    await act(async () => options.find((option) => option.textContent === name)!.click());
  }
  const fontTargets =
    '.overlay-player-name, .overlay-player-meta, .overlay-player-score, .overlay-match-chip strong, .overlay-info-rail';
  const originalFonts = new Map<string, string[]>();
  for (const profile of [gameProfiles['street-fighter-6'], gameProfiles['guilty-gear-strive']]) {
    transport.overlay.selectedSet.stylingGameId = profile.id;
    await view.rerender();
    originalFonts.set(
      profile.id,
      [...view.container.querySelectorAll(fontTargets)].map((element) => getComputedStyle(element).fontFamily)
    );
  }
  await chooseFont('Montserrat');
  expect(transport.state!.scoreboardFont).toBe('montserrat');
  for (const profile of [gameProfiles['street-fighter-6'], gameProfiles['guilty-gear-strive']]) {
    transport.overlay.selectedSet.stylingGameId = profile.id;
    await view.rerender();
    expect(view.container.querySelectorAll('.overlay-info-rail')).toHaveLength(3);
    for (const element of view.container.querySelectorAll(fontTargets)) {
      expect(getComputedStyle(element).fontFamily, profile.id).toContain('JABS Montserrat');
    }
  }
  await chooseFont('[DEFAULT]');
  expect(transport.state!.scoreboardFont).toBeUndefined();
  for (const profile of [gameProfiles['street-fighter-6'], gameProfiles['guilty-gear-strive']]) {
    transport.overlay.selectedSet.stylingGameId = profile.id;
    await view.rerender();
    expect(
      [...view.container.querySelectorAll(fontTargets)].map((element) => getComputedStyle(element).fontFamily)
    ).toEqual(originalFonts.get(profile.id));
  }
  await chooseFont('Oswald');
  customActive = true;
  await view.rerender();
  expect(fontInput.disabled).toBe(true);
  expect(fontInput.value).toBe('Anton');
  expect(transport.state!.scoreboardFont).toBe('oswald');
  customActive = false;
  await view.rerender();
  expect(fontInput.value).toBe('Oswald');
  await act(async () => settingsButton.click());
  const originalScores = new Map<string, string[]>();
  for (const profile of [gameProfiles['street-fighter-6'], gameProfiles['guilty-gear-strive']]) {
    transport.overlay.selectedSet.stylingGameId = profile.id;
    await view.rerender();
    originalScores.set(
      profile.id,
      ['left', 'right'].map(
        (side) => getComputedStyle(view.container.querySelector(`.overlay-player-${side} .overlay-player-score`)!).color
      )
    );
  }
  await act(async () => {
    await settings!.update((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        winnersLabel: 'Heaven',
        losersLabel: 'El Camino del Ninja',
        colorOverride: true,
        primaryColor: '#112233',
        secondaryColor: '#445566',
        textSize: 'large',
        broadcastLanguage: 'es-419',
        entranceAnimations: false
      }
    }));
  });
  expect(i18n.language).toBe('en');
  await act(async () => {
    await settings!.update((current) => ({
      ...current,
      appearance: { ...current.appearance, winnersLabel: undefined }
    }));
  });
  expect(view.container.querySelector('.bracket-lane.is-winners h2')?.textContent).toBe('Ganadores');
  expect(document.body.textContent).toContain('Bracket names');
  await act(async () => {
    await settings!.update((current) => ({
      ...current,
      appearance: { ...current.appearance, winnersLabel: 'Heaven' }
    }));
  });

  expect(view.container.querySelector('.bracket-screen header > div > span')?.textContent).toBe('Bracket');
  expect(view.container.querySelector('.bracket-lane.is-winners h2')?.textContent).toBe('Heaven');
  expect(view.container.querySelector('.bracket-lane.is-losers h2')?.textContent).toBe('El Camino del Ninja');
  expect(view.container.querySelector('.bracket-round-title')?.textContent).toBe('Original round name');
  const canvas = view.container.querySelector<HTMLElement>('.bracket-screen')!;
  expect(canvas.style.getPropertyValue('--game-accent')).toBe('#112233');
  expect(canvas.style.getPropertyValue('--broadcast-right')).toBe('#445566');
  expect(canvas.style.getPropertyValue('--appearance-text-scale')).toBe('1.12');
  await act(async () => {
    await settings!.update((current) => ({ ...current, appearance: { ...current.appearance, colorOverride: false } }));
  });
  expect(canvas.style.getPropertyValue('--game-accent')).toBe('');
  expect(transport.state!.appearance.primaryColor).toBe('#112233');
  for (const profile of [gameProfiles['street-fighter-6'], gameProfiles['guilty-gear-strive']]) {
    transport.overlay.selectedSet.stylingGameId = profile.id;
    await view.rerender();
    expect(
      ['left', 'right'].map(
        (side) => getComputedStyle(view.container.querySelector(`.overlay-player-${side} .overlay-player-score`)!).color
      ),
      profile.id
    ).toEqual(originalScores.get(profile.id));
  }
  await act(async () => {
    await settings!.update((current) => ({ ...current, appearance: { ...current.appearance, colorOverride: true } }));
  });

  const label = [...document.querySelectorAll('label')].find((node) => node.textContent === 'Preset name')!;
  const input = document.getElementById(label.htmlFor) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Weekly');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const save = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Save preset')!;
  await act(async () => save.click());
  expect(transport.state!.presets).toHaveLength(1);
  expect(transport.state!.presets[0].appearance.losersLabel).toBe('El Camino del Ninja');
  await act(async () => document.querySelector<HTMLButtonElement>('.mantine-Drawer-close')!.click());
  for (const profile of [gameProfiles['street-fighter-6'], gameProfiles['guilty-gear-strive']]) {
    transport.overlay.selectedSet.stylingGameId = profile.id;
    await view.rerender();
    const left = view.container.querySelector('.overlay-player-left .overlay-player-score')!;
    const right = view.container.querySelector('.overlay-player-right .overlay-player-score')!;
    expect(getComputedStyle(left).color, profile.id).toBe('#112233');
    expect(getComputedStyle(right).color, profile.id).toBe('#445566');
  }
  await act(async () => settingsButton.click());
  const presetLabel = [...document.querySelectorAll('label')].find((node) => node.textContent === 'Saved preset')!;
  expect((document.getElementById(presetLabel.htmlFor) as HTMLInputElement).value).toBe('Weekly');
  expect((document.getElementById(label.htmlFor) as HTMLInputElement).value).toBe('Weekly');
  expect(transport.state!.appearance.primaryColor).toBe('#112233');
  expect(transport.state!.presets).toHaveLength(1);
  const exported = exportAppearance('Weekly', transport.state!.appearance);
  expect(JSON.parse(exported)).not.toHaveProperty('scoreboardFont');
  expect(JSON.parse(exported).appearance).not.toHaveProperty('scoreboardFont');
  expect(transport.state!.presets[0].appearance).not.toHaveProperty('scoreboardFont');
  expect(parseAppearanceFile(exported).appearance).toEqual(transport.state!.appearance);
  expect(() => parseAppearanceFile(JSON.stringify({ ...JSON.parse(exported), token: 'unexpected' }))).toThrow();
  expect(() => parseAppearanceFile(exported.replace('#112233', 'url(file:///tmp/image)'))).toThrow();
  const restore = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Restore defaults')!;
  await act(async () => restore.click());
  expect(transport.state!.appearance).toEqual(defaultAppearance);
  expect(transport.state!.scoreboardFont).toBe('oswald');
  expect(transport.state!.presets).toHaveLength(1);
  expect(canvas.style.getPropertyValue('--game-accent')).toBe('');
  expect(canvas.style.getPropertyValue('--bracket-accent')).toBe('#30d5ff');
  expect(view.container.querySelector('.bracket-lane.is-losers h2')?.textContent).toBe('Losers');
  // A settings write from another window reaches this page through the realtime stream.
  transport.state = {
    ...transport.state!,
    appearance: { ...defaultAppearance, losersLabel: 'Lower' },
    updatedAt: new Date(Date.parse(transport.state!.updatedAt) + 1).toISOString()
  };
  await act(async () =>
    sockets.forEach((socket) =>
      socket.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ event: 'appearance-preferences', payload: transport.state })
        })
      )
    )
  );
  expect(view.container.querySelector('.bracket-lane.is-losers h2')?.textContent).toBe('Lower');
  expect(sockets).toHaveLength(1);
  await view.unmount();
  styles.remove();
  window.history.replaceState(null, '', originalPath);
  vi.unstubAllGlobals();
}, 15_000);

it('recovers the font selector after initial settings reads fail and preserves saved preferences', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  vi.useFakeTimers();
  vi.stubGlobal(
    'WebSocket',
    class extends EventTarget {
      close() {}
    }
  );
  try {
    for (const liveReady of [false, true]) {
      const original = appearancePreferencesSchema.parse({
        scoreboardFont: 'oswald',
        appearance: { colorOverride: true, primaryColor: '#112233' },
        presets: [{ id: 'weekly', name: 'Weekly', appearance: { losersLabel: 'Lower' } }],
        operatorLanguage: 'en',
        updatedAt: '2026-10-18T00:00:00Z'
      });
      transport.load.mockReset().mockRejectedValue(new Error('Settings temporarily unavailable'));
      if (liveReady) transport.load.mockResolvedValueOnce(original);
      transport.save.mockReset().mockImplementation(async (next: AppearancePreferences) => next);
      const view = await mountView(() =>
        h(MantineProvider, { env: 'test' }, h(AppearanceProvider, { children: h(BroadcastScoreboardFontSelect) }))
      );
      const input = () => view.container.querySelector<HTMLInputElement>('input')!;
      expect(input().disabled).toBe(true);
      expect(view.container.textContent).toContain('Reconnecting to font settings…');
      expect(transport.save).not.toHaveBeenCalled();
      transport.load.mockResolvedValue(original);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(input().disabled, `live snapshot available: ${liveReady}`).toBe(false);
      expect(input().value).toBe('Oswald');
      expect(view.container.textContent).not.toContain('Reconnecting to font settings…');
      await act(async () => input().click());
      const option = [...document.querySelectorAll<HTMLElement>('[role=option]')].find(
        (node) => node.textContent === 'Anton'
      )!;
      await act(async () => option.click());
      expect(transport.save).toHaveBeenCalledExactlyOnceWith({ ...original, scoreboardFont: 'anton' });
      const calls = transport.load.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(transport.load).toHaveBeenCalledTimes(calls);
      await view.unmount();
    }
    // Leaving the app while its first read is failing cancels scheduled retries.
    transport.load.mockReset().mockRejectedValue(new Error('Settings temporarily unavailable'));
    const view = await mountView(() => h(AppearanceProvider, { children: null }));
    await view.unmount();
    const calls = transport.load.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(transport.load).toHaveBeenCalledTimes(calls);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
