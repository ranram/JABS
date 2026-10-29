// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { act, createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mountView } from '../../hooks/hookTestHarness';
import { TopEightName } from './TopEightName';

afterEach(() => {
  document.getElementById('name-fitting-test')?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('fits long names and restores the design size after resizing or shortening the name', async () => {
  const css = document.createElement('style');
  css.id = 'name-fitting-test';
  css.textContent = readFileSync('src/renderer/src/ui/operator/topEight.css', 'utf8');
  document.head.append(css);
  css.textContent += '\n.top8-neon .top8-name-row > strong { font-size: 27px; }';
  let available = 100;
  let name = 'あいう/ABC';
  let resize = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => available);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    const naturalWidth = this.textContent === 'あいう/ABC' ? 150 : 40;
    return Math.ceil((naturalWidth * Number.parseFloat(getComputedStyle(this).fontSize)) / 27);
  });
  const view = await mountView(() =>
    h(
      'section',
      { className: 'top8-canvas top8-neon' },
      h('span', { className: 'top8-name-row' }, h(TopEightName, { name, singleLine: true }))
    )
  );
  const field = view.container.querySelector('strong')!;
  const row = field.parentElement!;
  const height = getComputedStyle(row).height;
  expect(field.textContent).toBe('あいう/ABC');
  expect(getComputedStyle(field).whiteSpace).toBe('nowrap');
  expect(field.scrollWidth).toBeLessThanOrEqual(available);
  available = 200;
  await act(async () => resize());
  expect(getComputedStyle(field).fontSize).toBe('27px');
  available = 100;
  await act(async () => resize());
  expect(field.scrollWidth).toBeLessThanOrEqual(available);
  name = 'Test';
  await view.rerender();
  expect(getComputedStyle(field).fontSize).toBe('27px');
  expect(getComputedStyle(row).height).toBe(height);
});
