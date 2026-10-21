// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mirrorCustomScoreboardRegion, type CustomScoreboard } from '@shared/customScoreboards';
import { createTestCustomScoreboard } from '@shared/testFixtures';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { useCustomScoreboardDraft } from './useCustomScoreboardDraft';

const save = vi.hoisted(() => vi.fn());
vi.mock('../../api', () => ({ api: { updateCustomScoreboard: save } }));
afterEach(() => {
  vi.useRealTimers();
  save.mockReset();
});

function layout(id = 'first') {
  return createTestCustomScoreboard({
    id,
    name: id,
    typography: { textColor: '#ffffff', outline: 'none', nameSize: 30, metaSize: 20, scoreSize: 40, contextSize: 20 }
  });
}

it('coalesces edits and serializes layout switches without overwriting newer input with late responses', async () => {
  vi.useFakeTimers();
  const first = deferred<CustomScoreboard>();
  const second = deferred<CustomScoreboard>();
  const third = deferred<CustomScoreboard>();
  save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  const onSaved = vi.fn();
  const hook = await mountHook(() => useCustomScoreboardDraft({ onSaved, onError: vi.fn() }), true);
  await act(async () => hook.current.select(layout()));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    hook.current.setDraft((value) => ({ ...value!, name: 'First edit' }));
    hook.current.setDraft((value) => ({ ...value!, name: 'Latest edit' }));
    hook.current.setDraft((value) => mirrorCustomScoreboardRegion(value!, 'playerOneName'));
    await vi.advanceTimersByTimeAsync(399);
  });
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].name).toBe('Latest edit');
  expect(save.mock.calls[0][0].playerElements.playerTwo.name).toEqual({
    x: 1820,
    y: 0,
    width: 100,
    height: 40,
    align: 'right'
  });
  await act(async () => {
    hook.current.setDraft((value) => ({
      ...value!,
      typography: { ...value!.typography, nameSize: 45, font: 'anton' }
    }));
    hook.current.select(layout('second'));
    hook.current.setDraft((value) => ({ ...value!, name: 'Other layout' }));
  });
  await act(async () => first.resolve({ ...save.mock.calls[0][0], frameRevision: '2' }));
  expect(hook.current.draft?.name).toBe('Other layout');
  expect(save.mock.calls[1][0]).toMatchObject({ id: 'first', typography: { nameSize: 45, font: 'anton' } });
  await act(async () => second.resolve({ ...save.mock.calls[1][0], frameRevision: '3' }));
  expect(save.mock.calls[2][0]).toMatchObject({ id: 'second', name: 'Other layout' });
  await act(async () => hook.current.select(layout()));
  expect(hook.current.draft?.typography.nameSize).toBe(45);
  expect(hook.current.draft?.typography.font).toBe('anton');
  expect(hook.current.draft?.playerElements.playerTwo.name.x).toBe(1820);
  await act(async () => third.resolve({ ...save.mock.calls[2][0], frameRevision: '4' }));
  expect(hook.current.draft).toMatchObject({ id: 'first', name: 'Latest edit', frameRevision: '3' });
  expect(hook.current.status).toBe('saved');
  expect(hook.current.saving).toBe(false);
  expect(onSaved).toHaveBeenCalledTimes(3);
});

it('keeps rejected drafts for retry, waits for valid input, and flushes queued edits when leaving', async () => {
  vi.useFakeTimers();
  save.mockRejectedValueOnce(new Error('Disk unavailable')).mockImplementation(async (value) => value);
  const onError = vi.fn();
  const onIdleSaved = vi.fn();
  const hook = await mountHook(() => useCustomScoreboardDraft({ onSaved() {}, onIdleSaved, onError }));
  await act(async () => hook.current.select(layout()));
  await act(async () => {
    hook.current.setDraft((value) => ({ ...value!, name: 'Keep my edit' }));
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(hook.current.status).toBe('error');
  expect(hook.current.draft?.name).toBe('Keep my edit');
  expect(onError).toHaveBeenCalledOnce();
  await act(async () => {
    hook.current.select(layout('second'));
    hook.current.select(layout());
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(onIdleSaved).not.toHaveBeenCalled();
  expect(hook.current.draft?.name).toBe('Keep my edit');
  await act(async () => hook.current.retry());
  expect(save).toHaveBeenCalledTimes(2);
  expect(hook.current.status).toBe('saved');
  await act(async () => {
    hook.current.setDraft((value) => ({ ...value!, typography: { ...value!.typography, textColor: '#f' } }));
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(hook.current.status).toBe('incomplete');
  expect(save).toHaveBeenCalledTimes(2);
  expect(onIdleSaved).not.toHaveBeenCalled();
  await act(async () =>
    hook.current.setDraft((value) => ({ ...value!, typography: { ...value!.typography, textColor: '#ff0000' } }))
  );
  await hook.unmount();
  expect(save).toHaveBeenCalledTimes(3);
  expect(save.mock.calls[2][0]).toMatchObject({ name: 'Keep my edit', typography: { textColor: '#ff0000' } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(onIdleSaved).not.toHaveBeenCalled();
});

it('announces one saved result after editing is idle and all writes finish, cancelling notices when switching layouts', async () => {
  vi.useFakeTimers();
  save.mockImplementation(async (value) => value);
  const onSaved = vi.fn();
  const onIdleSaved = vi.fn();
  const hook = await mountHook(() => useCustomScoreboardDraft({ onSaved, onIdleSaved, onError: vi.fn() }));
  await act(async () => {
    hook.current.select(layout());
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(onIdleSaved).not.toHaveBeenCalled();
  await act(async () => {
    hook.current.setDraft((value) => ({ ...value!, name: 'First edit' }));
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(onSaved).toHaveBeenCalledOnce();
  expect(onIdleSaved).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
    hook.current.setDraft((value) => ({ ...value!, name: 'Latest edit' }));
    await vi.advanceTimersByTimeAsync(2999);
  });
  expect(onSaved).toHaveBeenCalledTimes(2);
  expect(onIdleSaved).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(onIdleSaved).toHaveBeenCalledOnce();

  const slowSave = deferred<CustomScoreboard>();
  save.mockReturnValueOnce(slowSave.promise);
  await act(async () => {
    hook.current.setDraft((value) => ({ ...value!, name: 'Slow save' }));
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(onSaved).toHaveBeenCalledTimes(2);
  expect(onIdleSaved).toHaveBeenCalledOnce();
  await act(async () => {
    slowSave.resolve(save.mock.calls[2][0]);
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(onSaved).toHaveBeenCalledTimes(3);
  expect(onIdleSaved).toHaveBeenCalledTimes(2);
  await act(async () => {
    hook.current.setDraft((value) => ({ ...value!, name: 'Saved before switching' }));
    await vi.advanceTimersByTimeAsync(400);
    hook.current.select(layout('second'));
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(onSaved).toHaveBeenCalledTimes(4);
  expect(onIdleSaved).toHaveBeenCalledTimes(2);
  await act(async () => {
    hook.current.setDraft((value) => ({ ...value!, name: 'Saved before leaving' }));
    await vi.advanceTimersByTimeAsync(400);
  });
  await hook.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(onSaved).toHaveBeenCalledTimes(5);
  expect(onIdleSaved).toHaveBeenCalledTimes(2);
});
