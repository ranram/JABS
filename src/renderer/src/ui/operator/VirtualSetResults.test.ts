// @vitest-environment happy-dom
import { act, createElement as h, useRef } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { VirtualSetResults } from './VirtualSetResults';

// This test models two columns to check mounted-card counts and keyboard navigation.
// Actual spacing and variable card heights need visual review in the app.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('bounds mounted cards, follows scrolling, preserves focus, and resets after filtering', async () => {
  await initializeI18n();
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(650);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 112 } as DOMRect);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      active = true;
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        queueMicrotask(() => {
          if (this.active) this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
        });
      }
      disconnect() {
        this.active = false;
      }
    }
  );
  const sets = Array.from({ length: 1000 }, (_, index) => ({ id: String(index + 1), state: '1' }));
  const assignments = new Map();
  const queuePositions = new Map();
  let resetKey = 'all';
  function Fixture() {
    const scrollRef = useRef<HTMLDivElement>(null);
    return h(
      'div',
      { ref: scrollRef, className: 'results', style: { gridTemplateColumns: '300px 300px', rowGap: 12 } },
      h(VirtualSetResults, { sets, assignments, queuePositions, scrollRef, resetKey, disabled: false, onOpenSet() {} })
    );
  }
  const view = await mountView(() => h(MantineProvider, { env: 'test' }, h(Fixture)));
  const root = view.container.querySelector<HTMLDivElement>('.results')!;
  const rows = () => [...root.querySelectorAll<HTMLElement>('.set-row')];
  const scroll = async (top: number) =>
    act(async () => {
      root.scrollTop = top;
      root.dispatchEvent(new Event('scroll'));
      await vi.advanceTimersByTimeAsync(30);
    });
  expect(rows().length).toBeLessThan(30);
  const first = root.querySelector<HTMLElement>('[data-testid=set-1]')!;
  expect(first).not.toBeNull();
  await act(async () => first.focus());
  await scroll(30_000);
  expect(document.activeElement).toBe(first);
  expect(first.isConnected).toBe(true);
  expect(rows().some((row) => Number(row.dataset.testid?.slice(4)) > 450)).toBe(true);
  expect(rows().length).toBeLessThan(35);
  // Even with the first card pinned far above the viewport, Tab follows the
  // logical match order rather than jumping to the visible window.
  await act(async () =>
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  );
  expect((document.activeElement as HTMLElement).dataset.testid).toBe('set-2');
  await act(async () =>
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  );
  expect((document.activeElement as HTMLElement).dataset.testid).toBe('set-3');
  await act(async () => (document.activeElement as HTMLElement).blur());
  await scroll(61_500);
  expect(root.querySelector('[data-testid=set-1000]')).not.toBeNull();
  resetKey = 'filtered';
  await view.rerender();
  expect(root.scrollTop).toBe(0);
  expect(root.querySelector('[data-testid=set-1]')).not.toBeNull();
});
