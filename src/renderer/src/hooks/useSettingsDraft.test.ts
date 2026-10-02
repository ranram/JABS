// @vitest-environment happy-dom
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { deferred, mountHook } from './hookTestHarness';
import { useSettingsDraft } from './useSettingsDraft';

it('serializes writes, coalesces pending edits and preserves their optimistic preview', async () => {
  const initial = { first: false, second: false, label: 'old', updatedAt: '1' };
  const first = deferred<typeof initial>();
  const second = deferred<typeof initial>();
  const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const hook = await mountHook(() => useSettingsDraft({ load: async () => initial, save, onError: vi.fn() }));
  let results: Promise<boolean>[] = [];
  await act(async () => {
    results = [hook.current.update({ first: true }), hook.current.update({ second: true }), hook.current.update({ label: 'new' })];
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(hook.current.state).toMatchObject({ first: true, second: true, label: 'new' });
  await act(async () => first.resolve({ ...initial, first: true, updatedAt: '2' }));
  expect(save).toHaveBeenLastCalledWith({ first: true, second: true, label: 'new', updatedAt: '2' });
  expect(hook.current.saving).toBe(true);
  await act(async () => second.resolve({ first: true, second: true, label: 'new', updatedAt: '3' }));
  expect(await Promise.all(results)).toEqual([true, true, true]);
  expect(hook.current.state?.updatedAt).toBe('3');
  expect(hook.current.saving).toBe(false);
});

it('returns failure, reloads acknowledged state and rebases later edits after a rejected save', async () => {
  const initial = { name: 'original', visible: true, updatedAt: '1' };
  const failed = deferred<typeof initial>();
  const load = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue({ ...initial, name: 'external', updatedAt: '2' });
  const save = vi.fn().mockReturnValueOnce(failed.promise).mockImplementation(async (state) => ({ ...state, updatedAt: '3' }));
  const onError = vi.fn();
  const hook = await mountHook(() => useSettingsDraft({ load, save, onError }));
  let bad!: Promise<boolean>;
  let good!: Promise<boolean>;
  await act(async () => { bad = hook.current.update({ name: 'rejected' }); good = hook.current.update({ visible: false }); });
  await act(async () => failed.reject(new Error('Conflict')));
  expect(await bad).toBe(false);
  expect(await good).toBe(true);
  expect(onError).toHaveBeenCalledOnce();
  expect(save).toHaveBeenLastCalledWith({ name: 'external', visible: false, updatedAt: '2' });
  expect(hook.current.state).toEqual({ name: 'external', visible: false, updatedAt: '3' });
  await act(async () => { void hook.current.update({ visible: true }, 1_000); });
  await hook.unmount();
  expect(save).toHaveBeenLastCalledWith({ name: 'external', visible: true, updatedAt: '3' });
});
