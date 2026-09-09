import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { useScoreShortcuts } from './useScoreShortcuts';

const harness = vi.hoisted(() => ({ enabled: true, effect: undefined as undefined | (() => void | (() => void)) }));
vi.mock('react', () => ({
  useState: () => [harness.enabled, (value: boolean) => { harness.enabled = value; }],
  useEffect: (effect: typeof harness.effect) => { harness.effect = effect; }
}));
afterEach(() => { vi.unstubAllGlobals(); harness.enabled = true; });

function setup(options: { disabled?: boolean; modalOpen?: boolean } = {}) {
  let handler: (event: KeyboardEvent) => void;
  const remove = vi.fn();
  vi.stubGlobal('window', { addEventListener: (_: string, callback: typeof handler) => { handler = callback; }, removeEventListener: remove });
  class Target {
    constructor(public typing = false) {}
    isContentEditable = false;
    matches(selector: string) { return this.typing && !(this instanceof Checkbox && selector.includes(':not([type="checkbox"])')); }
    closest() { return null; }
  }
  class Checkbox extends Target {}
  vi.stubGlobal('HTMLElement', Target);
  const querySelectorAll = vi.fn().mockReturnValue([]);
  vi.stubGlobal('document', { querySelectorAll });
  vi.stubGlobal('getComputedStyle', (element: { visibility?: string }) => ({ visibility: element.visibility ?? 'visible' }));
  const onScore = vi.fn();
  const onReset = vi.fn();
  const onSwap = vi.fn();
  const onSwapCommentators = vi.fn();
  const selectedSet = createTestOverlayState().selectedSet!;
  const render = () => {
    useScoreShortcuts({ selectedSet, disabled: false, modalOpen: false, ...options, onScore, onReset, onSwap, onSwapCommentators });
    return harness.effect!();
  };
  const cleanup = render();
  const press = (code: string, extra: Partial<KeyboardEvent> = {}) => {
    const event = { code, target: new Target(), preventDefault: vi.fn(), ...extra } as unknown as KeyboardEvent;
    handler(event);
    return event;
  };
  return { press, onScore, onReset, onSwap, onSwapCommentators, selectedSet, render, cleanup, remove, querySelectorAll, Target, Checkbox };
}

describe('live keyboard controls', () => {
  it('runs only exact control shortcuts and keeps score limits and cleanup', () => {
    const h = setup();
    h.press('KeyR', { ctrlKey: true });
    expect(h.onReset).not.toHaveBeenCalled();
    expect(h.press('KeyR', { ctrlKey: true, shiftKey: true }).preventDefault).toHaveBeenCalledOnce();
    expect(h.onReset).toHaveBeenCalledOnce();
    h.press('KeyS', { ctrlKey: true });
    expect(h.onSwap).not.toHaveBeenCalled();
    expect(h.press('KeyS', { ctrlKey: true, shiftKey: true }).preventDefault).toHaveBeenCalledOnce();
    expect(h.onSwap).toHaveBeenCalledOnce();
    h.press('Digit1');
    expect(h.onScore).toHaveBeenLastCalledWith('one', 1);
    h.press('Digit2', { shiftKey: true });
    expect(h.onScore).toHaveBeenCalledTimes(1);
    h.selectedSet.playerOne.score = 2;
    h.press('Digit1');
    expect(h.onScore).toHaveBeenCalledTimes(1);
    h.press('KeyC', { ctrlKey: true });
    expect(h.onSwapCommentators).not.toHaveBeenCalled();
    expect(h.press('KeyC', { ctrlKey: true, shiftKey: true }).preventDefault).toHaveBeenCalledOnce();
    expect(h.onSwapCommentators).toHaveBeenCalledOnce();
    h.cleanup?.();
    expect(h.remove).toHaveBeenCalledOnce();
  });

  it('blocks score and swap keys when disabled, busy, typing, composing, repeating or in a modal', () => {
    for (const options of [{ disabled: true }, { modalOpen: true }]) {
      const h = setup(options);
      h.press('Digit1'); h.press('KeyR', { ctrlKey: true, shiftKey: true }); h.press('KeyS', { ctrlKey: true, shiftKey: true });
      expect(h.onScore).not.toHaveBeenCalled(); expect(h.onReset).not.toHaveBeenCalled(); expect(h.onSwap).not.toHaveBeenCalled();
    }
    const h = setup();
    for (const extra of [{ repeat: true }, { isComposing: true }, { defaultPrevented: true },
      { target: new h.Target(true) as unknown as EventTarget }]) {
      h.press('Digit1', extra); h.press('KeyS', { ctrlKey: true, shiftKey: true, ...extra });
    }
    h.querySelectorAll.mockReturnValue([{ getClientRects: () => [{}], closest: () => null }]);
    h.press('Digit1'); h.press('KeyS', { ctrlKey: true, shiftKey: true });
    h.querySelectorAll.mockReturnValue([]);
    harness.enabled = false; h.render();
    h.press('Digit1'); h.press('KeyS', { ctrlKey: true, shiftKey: true });
    expect(h.onScore).not.toHaveBeenCalled(); expect(h.onSwap).not.toHaveBeenCalled();
    harness.enabled = true; h.render(); h.press('Digit1');
    expect(h.onScore).toHaveBeenCalledOnce();
    h.onScore.mockClear();
    h.onSwap.mockClear();
    h.querySelectorAll.mockReturnValue([
      { getClientRects: () => [], closest: () => null },
      { getClientRects: () => [{}], visibility: 'hidden', closest: () => null },
      { getClientRects: () => [{}], closest: () => ({}) }
    ]);
    const target = new h.Checkbox(true) as unknown as EventTarget;
    h.press('Digit1', { target });
    h.press('KeyS', { ctrlKey: true, shiftKey: true, target });
    expect(h.onScore).toHaveBeenCalledOnce();
    expect(h.onSwap).toHaveBeenCalledOnce();
    harness.enabled = false; h.render();
    h.press('Digit1', { target });
    expect(h.onScore).toHaveBeenCalledOnce();
    harness.enabled = true; h.render();
    h.press('Digit1', { target });
    expect(h.onScore).toHaveBeenCalledTimes(2);
    const editable = new h.Target(); editable.isContentEditable = true;
    h.press('Digit1', { target: editable as unknown as EventTarget });
    expect(h.onScore).toHaveBeenCalledTimes(2);
  });
});
