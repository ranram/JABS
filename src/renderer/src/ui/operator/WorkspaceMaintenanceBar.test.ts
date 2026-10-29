// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n, i18n } from '../../i18n';
import { setTutorialActive } from '../tutorials/tutorialActivity';
import { WorkspaceMaintenanceBar } from './WorkspaceMaintenanceBar';

const native = vi.hoisted(() => ({
  openFolder: vi.fn(async () => {}),
  allowlist: vi.fn(async () => 'saved contents')
}));
vi.mock('../../desktopRuntime', async (original) => ({
  ...(await original<typeof import('../../desktopRuntime')>()),
  isTauriRuntime: () => true,
  openNativeMediaDirectory: native.openFolder,
  getNativeModerationAllowlist: native.allowlist
}));
vi.mock('../../hooks/useStingers', () => ({ useStingers: () => ({}) }));
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
let unmountView: (() => Promise<void>) | undefined;

afterEach(async () => {
  await unmountView?.();
  unmountView = undefined;
  setTutorialActive(false);
  await i18n.changeLanguage('en');
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
  else Reflect.deleteProperty(document, 'fonts');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('keeps toolbar order, menu dismissal and open-dialog state through a language change', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  Object.defineProperty(document, 'fonts', { configurable: true, value: new EventTarget() });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const shortcuts = { enabled: true, setEnabled: vi.fn() };
  const reloadAssets = vi.fn();
  const selectSet = vi.fn();
  const noop = () => {};
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(WorkspaceMaintenanceBar, {
        keyboardShortcuts: shortcuts,
        loading: false,
        reloadingAssets: false,
        reloadSelectedSetDisabled: false,
        unloadTournamentDisabled: false,
        tournamentLoaded: true,
        setScope: { type: 'event', eventId: '1' },
        localBaseUrl: 'http://127.0.0.1:4279',
        onReloadAssets: reloadAssets,
        onReloadBracketData: noop,
        onReloadSelectedSet: noop,
        onUnloadTournament: noop,
        onClearCache: noop,
        onModerationApplied: noop,
        onCopy: noop,
        onConfigureStingers: noop,
        onTutorialWorkspace: noop,
        onOpenSetSelector: selectSet,
        setSelectorDisabled: false
      })
    )
  );
  unmountView = view.unmount;
  const bar = view.container.querySelector<HTMLElement>('.workspace-maintenance-bar')!;
  const toggle = view.container.querySelector<HTMLButtonElement>('[data-tutorial="matches-menu"]')!;
  function button(label: string, root: ParentNode = document) {
    const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent?.replace(/▾$/, '').trim() === label
    );
    expect(found, label).toBeTruthy();
    return found!;
  }
  const buttonLabel = (node: Element) => node.textContent?.replace(/▾$/, '').trim();
  expect([...bar.querySelectorAll('button')].map(buttonLabel).filter(Boolean)).toEqual([
    i18n.t('operator:utilityGroups.bracket'),
    i18n.t('operator:utilityGroups.matches'),
    i18n.t('operator:utilityGroups.media'),
    i18n.t('operator:utilityGroups.moderation'),
    i18n.t('operator:live.copyObs'),
    i18n.t('operator:workspaces.stingers'),
    i18n.t('operator:appearance.settings'),
    i18n.t('operator:help.title')
  ]);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await act(async () => button(i18n.t('operator:utilityGroups.media'), bar).click());
  await act(async () => button(i18n.t('operator:browser.reloadAssets')).click());
  expect(reloadAssets).toHaveBeenCalledOnce();

  await act(async () => button(i18n.t('operator:utilityGroups.moderation'), bar).click());
  await act(async () => button(i18n.t('operator:moderation.open')).click());
  expect(native.allowlist).toHaveBeenCalledOnce();
  const contents = document.querySelector<HTMLTextAreaElement>('.mantine-Modal-root textarea')!;
  expect(contents.value).toBe('saved contents');
  await act(async () => contents.focus());
  await view.rerender();
  expect(document.querySelector('.mantine-Modal-root textarea')).toBe(contents);
  await act(async () => document.querySelector<HTMLButtonElement>('.mantine-Modal-close')!.click());

  await act(async () => button(i18n.t('operator:appearance.settings'), bar).click());
  const shortcutLabel = [...document.querySelectorAll('label')].find(
    (node) => node.textContent === i18n.t('operator:editor.enableShortcuts')
  )!;
  const shortcut = document.getElementById(shortcutLabel.htmlFor) as HTMLInputElement;
  expect(shortcut.checked).toBe(true);
  await act(async () => shortcut.click());
  expect(shortcuts.setEnabled).toHaveBeenCalledWith(false);
  shortcuts.enabled = false;
  await view.rerender();
  await act(async () => i18n.changeLanguage('es-419'));
  expect(button(i18n.t('operator:utilityGroups.matches'), bar)).toBe(toggle);
  const translatedShortcutLabel = [...document.querySelectorAll('label')].find(
    (node) => node.textContent === i18n.t('operator:editor.enableShortcuts')
  )!;
  expect(document.getElementById(translatedShortcutLabel.htmlFor)).toBe(shortcut);
  expect(shortcut.checked).toBe(false);
  await act(async () => document.querySelector<HTMLButtonElement>('.mantine-Drawer-close')!.click());

  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await act(async () => {
    toggle.focus();
    toggle.click();
  });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual([
    i18n.t('operator:players.title'),
    i18n.t('operator:selector.open')
  ]);
  await act(async () => button(i18n.t('operator:selector.open'), menu).click());
  expect(selectSet).toHaveBeenCalledOnce();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');

  await act(async () => {
    toggle.focus();
    toggle.click();
  });
  await act(async () => {
    const players = document.querySelector<HTMLElement>('[data-tutorial="players"]')!;
    players.focus();
    players.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(toggle);
  await act(async () => {
    toggle.focus();
    toggle.click();
  });
  await act(async () => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(toggle.getAttribute('aria-expanded')).toBe('false');

  const media = bar.querySelector('.workspace-maintenance-media')!;
  const moderation = bar.querySelector('.workspace-maintenance-moderation')!;
  const before = [media.textContent, moderation.textContent];
  await act(async () => setTutorialActive(true));
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect([media.textContent, moderation.textContent]).toEqual(before);
  expect(media.querySelectorAll('button')).toHaveLength(1);
  expect(moderation.querySelectorAll('button')).toHaveLength(1);
  await act(async () => setTutorialActive(false));
});
