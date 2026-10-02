// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import type { Update } from '@tauri-apps/plugin-updater';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { useSettingsDraft } from '../../hooks/useSettingsDraft';
import { initializeI18n, i18n } from '../../i18n';
import { AppUpdateControls } from './AppUpdateControls';
import { useAppUpdates } from './useAppUpdates';

const transport = vi.hoisted(() => ({
  support: vi.fn(),
  check: vi.fn(),
  install: vi.fn(),
  restart: vi.fn()
}));
vi.mock('../../appUpdater', () => ({ appUpdater: transport }));
beforeAll(async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
function release() {
  return {
    version: '1.2.0',
    body: 'Improved saved-state recovery.',
    close: vi.fn().mockResolvedValue(undefined)
  } as unknown as Update;
}

it('handles checks, failed installations, progress, restart retry and late checks without reporting false success', async () => {
  transport.support.mockResolvedValue({ version: '1.1.1', availability: 'available' });
  transport.check.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(null);
  const update = release();
  transport.check.mockResolvedValue(update);
  const hook = await mountHook(() => useAppUpdates());
  expect(transport.check).not.toHaveBeenCalled();
  await act(async () => hook.current.checkForUpdates());
  expect(hook.current.failure).toBe('check');
  expect(hook.current.release).toBeUndefined();
  await act(async () => hook.current.checkForUpdates());
  expect(hook.current.phase).toBe('current');
  await act(async () => hook.current.checkForUpdates());
  expect(hook.current.release?.version).toBe('1.2.0');
  await act(async () => hook.current.installUpdate(true));
  expect(transport.install).not.toHaveBeenCalled();
  transport.install.mockRejectedValueOnce(new Error('Invalid signature'));
  await act(async () => hook.current.installUpdate(false));
  expect(hook.current.phase).toBe('available');
  expect(hook.current.failure).toBe('install');
  expect(transport.restart).not.toHaveBeenCalled();

  const installation = deferred<void>();
  transport.install.mockImplementationOnce((_update, progress) => {
    progress({ event: 'Started', data: { contentLength: 100 } });
    progress({ event: 'Progress', data: { chunkLength: 40 } });
    return installation.promise;
  });
  let install!: Promise<void>;
  await act(async () => {
    install = hook.current.installUpdate(false);
  });
  expect(hook.current.phase).toBe('downloading');
  expect(hook.current.progress).toBe(40);
  await act(async () => {
    await hook.current.checkForUpdates();
    await hook.current.installUpdate(false);
  });
  expect(transport.install).toHaveBeenCalledTimes(2);
  transport.restart.mockRejectedValueOnce(new Error('Restart failed')).mockResolvedValue(undefined);
  await act(async () => {
    installation.resolve();
    await install;
  });
  expect(update.close).toHaveBeenCalledOnce();
  expect(hook.current.phase).toBe('installed');
  expect(hook.current.failure).toBe('restart');
  await act(async () => hook.current.restartApp(false));
  expect(transport.restart).toHaveBeenCalledTimes(2);
  expect(transport.install).toHaveBeenCalledTimes(2);
  await hook.unmount();

  const late = deferred<Update | null>();
  transport.check.mockReturnValueOnce(late.promise);
  const next = await mountHook(() => useAppUpdates());
  let pending!: Promise<void>;
  await act(async () => {
    pending = next.current.checkForUpdates();
  });
  await next.unmount();
  const unused = release();
  await act(async () => {
    late.resolve(unused);
    await pending;
  });
  expect(unused.close).toHaveBeenCalledOnce();
});

it('blocks installation for dirty drafts and queued settings writes, and disables unsupported builds', async () => {
  vi.useFakeTimers();
  transport.support.mockResolvedValue({ version: '1.1.1', availability: 'available' });
  transport.check.mockResolvedValue(release());
  let blocked = true;
  const save = deferred<{ name: string }>();
  const hook = await mountHook(
    () => useSettingsDraft({ load: async () => ({ name: 'Saved' }), save: () => save.promise, onError: vi.fn() }),
    false,
    () => h(MantineProvider, { env: 'test' }, h(AppUpdateControls, { blocked }))
  );
  const button = (label: string) =>
    [...hook.container.querySelectorAll('button')].find((element) => element.textContent === label)!;
  await act(async () => button('Check for updates').click());
  expect(hook.container.textContent).toContain('v1.1.1');
  expect(hook.container.textContent).toContain('Version 1.2.0 is available.');
  expect(button('Update now').disabled).toBe(true);
  blocked = false;
  await hook.rerender();
  expect(button('Update now').disabled).toBe(false);
  await act(async () => {
    void hook.current.update({ name: 'Queued' }, 1_000);
  });
  expect(button('Update now').disabled).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  expect(button('Update now').disabled).toBe(true);
  await act(async () => save.resolve({ name: 'Queued' }));
  expect(button('Update now').disabled).toBe(false);
  await hook.unmount();
  transport.support.mockResolvedValue({ version: '1.1.1', availability: 'development' });
  const unsupported = await mountHook(
    () => undefined,
    false,
    () => h(MantineProvider, { env: 'test' }, h(AppUpdateControls, { blocked: false }))
  );
  expect(unsupported.container.querySelector('button')?.disabled).toBe(true);
  expect(transport.check).toHaveBeenCalledOnce();
  await unsupported.unmount();
});
