import { afterEach, expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { useStreamDraftAutosave } from './useStreamDraftAutosave';

const harness = vi.hoisted(() => ({ effect: undefined as undefined | (() => void), update: vi.fn() }));
vi.mock('react', () => ({
  useEffect: (effect: () => void) => { harness.effect = effect; },
  useRef: (current: unknown) => ({ current }),
  useState: () => [false, vi.fn()]
}));
vi.mock('../../api', () => ({ api: { updateSelectedSet: harness.update, reportRendererDiagnostic: vi.fn() } }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); harness.update.mockReset(); });

it('cancels queued autosaves and waits for an active save before clearing stream state', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const state = createTestOverlayState();
  const writes: string[] = [];
  const setup = () => {
    const controls = useStreamDraftAutosave({ draft: state.selectedSet, dirty: true,
      setOverlayState: () => { writes.push('save'); }, setDraftState: vi.fn(), setMessage: vi.fn(), failureMessage: 'Failed' });
    harness.effect!();
    return controls;
  };
  await setup().withAutosavePaused(async () => { writes.push('clear queued'); });
  await vi.advanceTimersByTimeAsync(200);
  expect(harness.update).not.toHaveBeenCalled();

  let finish!: (value: typeof state) => void;
  harness.update.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const controls = setup();
  await vi.advanceTimersByTimeAsync(200);
  expect(harness.update).toHaveBeenCalledOnce();
  const reset = controls.withAutosavePaused(async () => { writes.push('clear active'); });
  expect(writes).toEqual(['clear queued']);
  finish(state);
  await reset;
  expect(writes).toEqual(['clear queued', 'save', 'clear active']);
});
