// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { expect, it, vi } from 'vitest';
import { appearancePreferencesSchema, type AppearancePreferences } from '@shared/appearancePreferences';
import type { OverlayState } from '@shared/models';
import { createTestOverlayState } from '@shared/testFixtures';
import { AppearanceProvider } from '../renderer/src/ui/appearance/AppearanceProvider';
import { OverlayView } from '../renderer/src/ui/OverlayView';
import { BroadcastScoreboardFontSelect } from '../renderer/src/ui/fonts/BroadcastScoreboardFontSelect';
import { ImportedFontSettings } from '../renderer/src/ui/fonts/ImportedFontSettings';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { mountView } from '../renderer/src/hooks/hookTestHarness';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn(), hide: vi.fn() } }));

const transport = vi.hoisted(() => ({
  overlay: undefined as OverlayState | undefined,
  load: vi.fn(),
  save: vi.fn(),
  listFonts: vi.fn(),
  importFont: vi.fn(),
  deleteFont: vi.fn(),
  fontBytes: vi.fn()
}));
vi.mock('../renderer/src/api', () => ({
  api: {
    identityMedia: async (identities: unknown[]) => ({ matches: identities.map(() => ({})) }),
    appearancePreferences: transport.load,
    updateAppearancePreferences: transport.save,
    importedFonts: transport.listFonts,
    importFont: transport.importFont,
    deleteImportedFont: transport.deleteFont,
    importedFontBytes: transport.fontBytes
  },
  websocketUrl: async () => 'ws://127.0.0.1:4279/ws',
  acceptCatalogMessage: () => false
}));
vi.mock('../renderer/src/hooks/useOverlayState', () => ({ useOverlayState: () => ({ state: transport.overlay }) }));
vi.mock('../renderer/src/hooks/useLogoAssetUrl', () => ({ useLogoAssetUrl: () => undefined }));
vi.mock('../renderer/src/hooks/useScoreboardPhotos', () => ({
  useScoreboardPhotos: () => ({ state: { enabled: false, updatedAt: '1' } })
}));

it('imports, sizes and removes a font from Settings and the scoreboard overlay', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  const originalPath = window.location.pathname;
  window.history.replaceState(null, '', '/overlay/active/main');
  const font = { id: 'file-abcd', name: 'Tournament Display' };
  const secondFont = { id: 'file-1234', name: 'Another display font' };
  let fonts = [secondFont];
  let preferences = appearancePreferencesSchema.parse({
    appearance: {}, presets: [], operatorLanguage: 'en', updatedAt: '2026-10-18T00:00:00Z'
  });
  transport.overlay = createTestOverlayState();
  transport.load.mockReset().mockImplementation(async () => preferences);
  transport.save.mockReset().mockImplementation(async (submitted: AppearancePreferences) => {
    preferences = submitted;
    return submitted;
  });
  transport.listFonts.mockReset().mockImplementation(async () => ({ fonts }));
  transport.importFont.mockReset().mockImplementation(async () => {
    fonts = [...fonts, font];
    return font;
  });
  transport.deleteFont.mockReset().mockImplementation(async (id: string) => {
    fonts = fonts.filter((font) => font.id !== id);
  });
  // Font metrics matching a 478-unit cap height on a 1000-unit em.
  const bytes = new ArrayBuffer(154);
  const metrics = new DataView(bytes);
  metrics.setUint16(4, 2);
  metrics.setUint32(12, 0x68656164);
  metrics.setUint32(20, 44);
  metrics.setUint32(24, 20);
  metrics.setUint16(62, 1000);
  metrics.setUint32(28, 0x4f532f32);
  metrics.setUint32(36, 64);
  metrics.setUint32(40, 90);
  metrics.setUint16(64, 2);
  metrics.setInt16(152, 478);
  transport.fontBytes.mockReset().mockResolvedValue(bytes);
  vi.stubGlobal('WebSocket', class extends EventTarget { close() {} });
  vi.stubGlobal('confirm', vi.fn(() => true));
  const createFontFace = vi.fn();
  vi.stubGlobal('FontFace', class {
    constructor(...args: unknown[]) { createFontFace(...args); }
    async load() { return this; }
  });
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  const add = vi.fn();
  const remove = vi.fn();
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: Object.assign(new EventTarget(), { add, delete: remove, ready: Promise.resolve() })
  });
  try {
    const view = await mountView(() =>
      h(MantineProvider, { env: 'test' }, h(AppearanceProvider, { children: h('div', {},
        h(ImportedFontSettings), h(BroadcastScoreboardFontSelect), h(OverlayView)
      ) }))
    );
    try {
      const input = (name: string) => {
        const label = [...view.container.querySelectorAll('label')].find((item) => item.textContent === name)!;
        return document.getElementById(label.htmlFor) as HTMLInputElement;
      };
      const list = input('Scoreboard font');
      const toggle = view.container.querySelector<HTMLInputElement>('input[role="switch"]')!;
      expect(transport.listFonts).not.toHaveBeenCalled();
      await act(async () => toggle.click());
      expect(preferences.showImportedFonts).toBe(true);
      const picker = view.container.querySelector<HTMLInputElement>('input[type="file"]')!;
      const file = new File(['font'], 'Tournament Display.ttf');
      Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
      await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })));
      expect(transport.importFont).toHaveBeenCalledWith('Tournament Display', file);
      await act(async () => list.click());
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
        .find((item) => item.textContent === font.name)!;
      await act(async () => option.click());
      expect(preferences.scoreboardFont).toBe(font.id);
      expect(transport.fontBytes).toHaveBeenCalledExactlyOnceWith(font.id);
      expect(createFontFace).toHaveBeenCalledWith('JABS file-abcd', bytes, { sizeAdjust: '146%' });
      expect(add).toHaveBeenCalledOnce();
      const overlay = view.container.querySelector<HTMLElement>('[data-overlay-template]')!;
      expect(overlay.style.getPropertyValue('--scoreboard-font-family')).toBe('"JABS file-abcd"');
      await act(async () => toggle.click());
      expect(preferences.showImportedFonts).toBe(false);
      expect(overlay.style.getPropertyValue('--scoreboard-font-family')).toBe('"JABS file-abcd"');
      const button = [...view.container.querySelectorAll('button')].find((item) => item.textContent === 'Imported fonts')!;
      expect(button.getAttribute('aria-expanded')).toBe('false');
      await act(async () => button.click());
      const removeImported = view.container.querySelector<HTMLButtonElement>('[aria-label="Remove Tournament Display"]')!;
      await act(async () => removeImported.click());
      expect(transport.deleteFont).toHaveBeenCalledExactlyOnceWith(font.id);
      expect(preferences.scoreboardFont).toBeUndefined();
      expect(remove).toHaveBeenCalledOnce();
      expect(overlay.style.getPropertyValue('--scoreboard-font-family')).toBe('');
      expect(view.container.querySelector('[aria-label="Remove Tournament Display"]')).toBeNull();
      expect(view.container.querySelector('[aria-label="Remove Another display font"]')).not.toBeNull();
      await act(async () => input('Scoreboard text size').click());
      const largerText = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
        .find((item) => item.textContent === '120%')!;
      await act(async () => largerText.click());
      expect(preferences.scoreboardTextScale).toBe(120);
      expect(Number(overlay.style.getPropertyValue('--appearance-text-scale'))).toBeCloseTo(1.344);
    } finally {
      await view.unmount();
    }
  } finally {
    if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
    else Reflect.deleteProperty(document, 'fonts');
    window.history.replaceState(null, '', originalPath);
    vi.unstubAllGlobals();
  }
});
