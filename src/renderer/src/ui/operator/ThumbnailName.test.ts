// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mountView } from '../../hooks/hookTestHarness';
import { ThumbnailName } from './ThumbnailName';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['left', 'right'] as const)(
  'fits the full %s name and prefix, then restores space after edits or resizing',
  async (side) => {
    let width = 180;
    let name = 'Player 2';
    let sponsor: string | undefined = 'Test sponsor';
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
    const computedStyle = getComputedStyle;
    const fontSize = (row: HTMLElement) => parseFloat(row.style.fontSize || '40px');
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => {
      const style = computedStyle(element);
      return new Proxy(style, {
        get(target, key) {
          return key === 'fontSize' ? `${fontSize(element as HTMLElement)}px` : Reflect.get(target, key, target);
        }
      });
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(52);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return Math.ceil((this.textContent?.length ?? 0) * fontSize(this.parentElement!) * 0.6);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.scrollWidth;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return Math.ceil(fontSize(this.parentElement!) * 1.08);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.scrollHeight;
    });
    const view = await mountView(() => h(ThumbnailName, { name, sponsor, side }));
    const row = view.container.querySelector<HTMLElement>('strong')!;
    const line = row.querySelector<HTMLElement>('.thumbnail-name-line')!;
    const assertFits = () => {
      expect(line.scrollWidth).toBeLessThanOrEqual(width);
      expect(line.scrollHeight).toBeLessThanOrEqual(row.clientHeight);
    };
    expect(line.textContent).toBe(side === 'left' ? 'Test sponsor | Player 2' : 'Player 2 | Test sponsor');
    assertFits();
    expect(fontSize(row)).toBeLessThan(40);
    width = 800;
    await act(async () => resize());
    expect(fontSize(row)).toBe(40);
    width = 180;
    await act(async () => resize());
    assertFits();
    sponsor = 'A much longer sponsor';
    await view.rerender();
    assertFits();
    expect(line.textContent).toContain(sponsor);
    sponsor = undefined;
    name = 'Ada';
    await view.rerender();
    expect(line.textContent).toBe('Ada');
    expect(fontSize(row)).toBe(40);
  }
);
