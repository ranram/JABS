// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { useAssetRefreshOnReturn } from './useAssetRefreshOnReturn';

const check = vi.hoisted(() => vi.fn(async (_signal?: AbortSignal) => {}));
vi.mock('../../api', () => ({ api: { checkAssets: check } }));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('debounces returns, limits checks during repeated focus changes, and cancels scheduled work on close', async () => {
  vi.useFakeTimers();
  const view = await mountHook(useAssetRefreshOnReturn);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(check).not.toHaveBeenCalled();
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(check).toHaveBeenCalledTimes(1);
  await act(async () => {
    for (let index = 0; index < 10; index++) {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    }
    await vi.advanceTimersByTimeAsync(4_999);
  });
  expect(check).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(check).toHaveBeenCalledTimes(2);
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(check).toHaveBeenCalledTimes(2);
});

it('deduplicates pending checks and aborts them on unmount without forcing a reload', async () => {
  vi.useFakeTimers();
  const pending = deferred<void>();
  check.mockReturnValue(pending.promise);
  const view = await mountHook(useAssetRefreshOnReturn);
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(400);
  });
  const signal = check.mock.calls[0][0]!;
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(check).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.reject(new Error('Aborted')));
});
