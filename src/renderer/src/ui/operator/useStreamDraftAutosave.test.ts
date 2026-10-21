// @vitest-environment happy-dom
import { act, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { OverlayState } from '@shared/models';
import { createTestOverlayState } from '@shared/testFixtures';
import { deferred, mountHook } from '../../hooks/hookTestHarness';
import { useStreamDraftAutosave } from './useStreamDraftAutosave';
import { useOperatorDraft } from './useOperatorDraft';

const apiMock = vi.hoisted(() => ({ update: vi.fn(), message: vi.fn() }));
vi.mock('../../api', () => ({ api: { updateSelectedSet: apiMock.update, reportRendererDiagnostic: vi.fn() } }));
afterEach(() => { vi.useRealTimers(); apiMock.update.mockReset(); apiMock.message.mockReset(); });

function useEditor() {
  const [overlay, setOverlayState] = useState<OverlayState | undefined>(createTestOverlayState());
  const [draft, setDraftState] = useOperatorDraft(overlay?.selectedSet);
  const controls = useStreamDraftAutosave({ draft: draft?.value, dirty: draft?.dirty ?? false,
    setOverlayState, setDraftState, setMessage: apiMock.message, failureMessage: 'Failed' });
  return { ...controls, overlay, draft, setDraftState, setOverlayState,
    edit(displayName: string) { setDraftState((current) => ({ ...current!, value: { ...current!.value, displayName }, dirty: true })); }
  };
}

it('preserves mid-save edits, accepts realtime echoes, and ignores replies for a previous game', async () => {
  vi.useFakeTimers();
  const first = deferred<OverlayState>();
  const second = deferred<OverlayState>();
  apiMock.update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const hook = await mountHook(useEditor, true);
  await act(async () => hook.current.edit('First edit'));
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  expect(hook.current.saving).toBe(true);
  await act(async () => hook.current.edit('Second edit'));
  await act(async () => hook.current.setDraftState((current) => ({
    ...current!,
    value: {
      ...current!.value,
      playerOne: { ...current!.value.playerOne, localPlayerId: '1'.repeat(32), playerId: '366108' }
    }
  })));
  await act(async () => first.resolve({ selectedSet: { ...apiMock.update.mock.calls[0]![0], updatedAt: '2026-10-01T00:00:01Z' } }));
  expect(hook.current.draft?.value.displayName).toBe('Second edit');
  expect(hook.current.draft?.value.playerOne).toMatchObject({ localPlayerId: '1'.repeat(32), playerId: '366108' });
  expect(hook.current.draft?.dirty).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  expect(apiMock.update).toHaveBeenCalledTimes(2);
  const accepted = { selectedSet: { ...apiMock.update.mock.calls[1]![0], updatedAt: '2026-10-01T00:00:02Z' } };
  // Native saves broadcast their new version before the HTTP response arrives.
  await act(async () => hook.current.setOverlayState(accepted));
  expect(hook.current.draft?.value.updatedAt).toBe(accepted.selectedSet.updatedAt);
  expect(hook.current.draft?.dirty).toBe(true);
  await act(async () => second.resolve(accepted));
  expect(hook.current.draft?.dirty).toBe(false);
  expect(hook.current.draft?.value.displayName).toBe('Second edit');
  expect(apiMock.update.mock.calls[1]![0].playerOne).toMatchObject({ localPlayerId: '1'.repeat(32), playerId: '366108' });
  expect(hook.current.draft?.value.updatedAt).toBe('2026-10-01T00:00:02Z');
  const delayed = deferred<OverlayState>();
  apiMock.update.mockReturnValueOnce(delayed.promise);
  await act(async () => hook.current.edit('Old match edit'));
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  const switched = {
    ...hook.current.draft!.value,
    gameId: 'tekken-8' as const, videogameId: '49783', assetCatalogSlug: 'tekken-8',
    displayName: 'New game', updatedAt: '2026-10-01T00:00:04Z'
  };
  await act(async () => hook.current.setOverlayState({ selectedSet: switched }));
  await act(async () => delayed.resolve({ selectedSet: { ...apiMock.update.mock.calls[2]![0], updatedAt: '2026-10-01T00:00:03Z' } }));
  expect(hook.current.overlay?.selectedSet).toEqual(switched);
  expect(hook.current.draft?.value).toEqual(switched);
  expect(hook.current.draft?.dirty).toBe(false);
  await act(async () => hook.current.edit('Cancelled on unmount'));
  await hook.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(apiMock.update).toHaveBeenCalledTimes(3);
});

it('cancels queued saves, waits for in-flight saves before clearing, and blocks repeated failures', async () => {
  vi.useFakeTimers();
  const hook = await mountHook(useEditor);
  await act(async () => hook.current.edit('Queued'));
  await act(async () => hook.current.withAutosavePaused(async () => hook.current.setDraftState(undefined)));
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(apiMock.update).not.toHaveBeenCalled();
  const selectedSet = createTestOverlayState().selectedSet!;
  await act(async () => hook.current.setDraftState({ value: selectedSet, baseline: selectedSet, dirty: true }));
  const inFlight = deferred<OverlayState>();
  apiMock.update.mockReturnValueOnce(inFlight.promise);
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  const clear = vi.fn(async () => {
    hook.current.setOverlayState(undefined);
    hook.current.setDraftState(undefined);
  });
  let cleared!: Promise<void>;
  await act(async () => { cleared = hook.current.withAutosavePaused(clear); });
  expect(clear).not.toHaveBeenCalled();
  await act(async () => { inFlight.resolve({ selectedSet }); await cleared; });
  expect(hook.current.draft).toBeUndefined();
  apiMock.update.mockRejectedValue(new Error('Rejected'));
  await act(async () => hook.current.setDraftState({ value: selectedSet, baseline: selectedSet, dirty: true }));
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(hook.current.blocked).toBe(true);
  expect(apiMock.message).toHaveBeenLastCalledWith('Rejected', 'error');
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(apiMock.update).toHaveBeenCalledTimes(2);
  apiMock.update.mockImplementation(async (submitted) => ({ selectedSet: submitted }));
  await act(async () => hook.current.edit('Corrected match'));
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(apiMock.update).toHaveBeenCalledTimes(3);
  expect(hook.current.blocked).toBe(false);
  expect(hook.current.draft?.dirty).toBe(false);
  expect(hook.current.draft?.baseline.displayName).toBe('Corrected match');
  await hook.unmount();
});
