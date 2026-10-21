// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mountHook } from '../../hooks/hookTestHarness';
import { useVersusNameFit } from './useVersusNameFit';

const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
const appearance = vi.hoisted(() => ({ textSize: 'default' }));
vi.mock('../appearance/AppearanceProvider', () => ({ useAppearance: () => ({ appearance }) }));
afterEach(() => {
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts);
  else Reflect.deleteProperty(document, 'fonts');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('fits the whole centered name in both dimensions and grows or shrinks again with text size, identity and slot changes', async () => {
  let identity = 'SPONSOR | A Very Long Player Name';
  let width = 180;
  let glyphWidth = 0.3;
  const fonts = Object.assign(new EventTarget(), { ready: Promise.resolve() });
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
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
  const size = (row: HTMLElement) =>
    parseFloat(row.style.fontSize || (appearance.textSize === 'large' ? '86px' : '62px'));
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => {
    const style = computedStyle(element);
    return new Proxy(style, {
      get(target, key) {
        return key === 'fontSize' ? `${size(element as HTMLElement)}px` : Reflect.get(target, key, target);
      }
    });
  });
  // The preview starts at scale(0). Visual bounds are unusable, but its
  // logical name slots still have width and height for fitting.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect());
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(44);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return Math.ceil(identity.length * size(this.parentElement!) * glyphWidth);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.scrollWidth;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return Math.ceil(size(this.parentElement!) * 0.6);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.scrollHeight;
  });
  const view = await mountHook(
    () => useVersusNameFit(identity),
    false,
    (ref) => h('strong', { ref, className: 'versus-name-row' }, h('span', { className: 'versus-name-text' }, identity))
  );
  const row = view.container.querySelector<HTMLElement>('strong')!;
  const text = row.firstElementChild!;
  const assertFits = () => {
    expect(text.scrollWidth).toBeLessThanOrEqual(width);
    expect(text.scrollHeight).toBeLessThanOrEqual(44);
  };
  assertFits();
  expect(size(row)).toBeLessThan(62);
  for (const textSize of ['large', 'default']) {
    appearance.textSize = textSize;
    await view.rerender();
    assertFits();
  }
  identity = 'Jr';
  await view.rerender();
  expect(size(row)).toBe(62);
  appearance.textSize = 'large';
  await view.rerender();
  assertFits();
  expect(size(row)).toBeGreaterThan(62);
  expect(size(row)).toBeLessThan(86);
  appearance.textSize = 'default';
  await view.rerender();
  expect(size(row)).toBe(62);
  width = 20;
  await act(async () => resize());
  assertFits();
  expect(size(row)).toBeLessThan(62);
  width = 180;
  await act(async () => resize());
  expect(size(row)).toBe(62);
  identity = 'Late font';
  await view.rerender();
  const beforeFontLoad = size(row);
  glyphWidth = 0.9;
  await act(async () => fonts.dispatchEvent(new Event('loadingdone')));
  assertFits();
  expect(size(row)).toBeLessThan(beforeFontLoad);
});
