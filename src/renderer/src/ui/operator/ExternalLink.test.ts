// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { Button, MantineProvider, Menu } from '@mantine/core';
import { expect, it, vi } from 'vitest';
import { initializeI18n, i18n } from '../../i18n';
import { mountView } from '../../hooks/hookTestHarness';
import { ExternalLink } from './ExternalLink';

const bridge = vi.hoisted(() => ({ invoke: vi.fn(), notify: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }));
vi.mock('./useOperatorNotifications', () => ({ useOperatorNotifications: () => bridge.notify }));

it('hands desktop link clicks to the browser, reports failures, and preserves ordinary web links', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  bridge.invoke.mockResolvedValue(undefined);
  const descriptor = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__');
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  // Stop happy-dom navigation after observing whether the link handled the event.
  const intercepted: boolean[] = [];
  const stopNavigation = (event: Event) => {
    intercepted.push(event.defaultPrevented);
    event.preventDefault();
  };
  document.addEventListener('click', stopNavigation);
  document.addEventListener('auxclick', stopNavigation);
  try {
    for (const href of [
      'https://developer.start.gg/docs/authentication/',
      'https://www.start.gg/user/a1b2c3d4',
      'https://ko-fi.com/ranram'
    ]) {
      const menuChange = vi.fn();
      const linkContent = href === 'https://ko-fi.com/ranram'
        ? h(Menu, { opened: true, onChange: menuChange, withinPortal: false },
            h(Menu.Target, null, h(Button<'button'>, null, 'Help')),
            h(Menu.Dropdown, null, h(Menu.Item<typeof ExternalLink>, {
              component: ExternalLink, href, children: 'Open link'
            })))
        : h(ExternalLink, { href, children: 'Open link' });
      const view = await mountView(() =>
        h(MantineProvider, { env: 'test' }, linkContent)
      );
      const link = view.container.querySelector('a')!;
      expect(link.href).toBe(href);
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noreferrer');
      for (const [type, options] of [
        ['click', {}],
        ['click', { ctrlKey: true }],
        ['auxclick', { button: 1 }]
      ] as const) {
        bridge.invoke.mockClear();
        await act(async () => {
          link.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));
        });
        expect(intercepted.at(-1)).toBe(true);
        expect(bridge.invoke).toHaveBeenCalledExactlyOnceWith('open_external_url', { url: href });
        if (href === 'https://ko-fi.com/ranram' && type === 'click') {
          expect(menuChange).toHaveBeenLastCalledWith(false);
        }
      }
      bridge.invoke.mockClear();
      await act(async () => {
        link.dispatchEvent(new MouseEvent('auxclick', { button: 2, bubbles: true, cancelable: true }));
      });
      expect(bridge.invoke).not.toHaveBeenCalled();
      bridge.invoke.mockRejectedValueOnce(new Error('No default browser'));
      await act(async () => link.click());
      expect(bridge.notify).toHaveBeenLastCalledWith('Could not open this link in your browser.', 'error');

      Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
      bridge.invoke.mockClear();
      await act(async () => link.click());
      expect(intercepted.at(-1)).toBe(false);
      expect(bridge.invoke).not.toHaveBeenCalled();
      await view.unmount();
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    }
  } finally {
    document.removeEventListener('click', stopNavigation);
    document.removeEventListener('auxclick', stopNavigation);
    if (descriptor) Object.defineProperty(window, '__TAURI_INTERNALS__', descriptor);
    else Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  }
});
