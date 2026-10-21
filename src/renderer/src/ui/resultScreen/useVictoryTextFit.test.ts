// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mountView } from '../../hooks/hookTestHarness';
import { useVictoryTextFit } from './useVictoryTextFit';

afterEach(() => vi.restoreAllMocks());

it('preserves identity prominence despite tall glyphs and only shrinks for line width', async () => {
  let identity = 'TEAM PLAYER';
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(188);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(240);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return Math.max(900, identity.length * parseFloat(this.style.fontSize || '184') * 0.4);
  });
  function Identity() {
    const ref = useVictoryTextFit(identity, true);
    return h('div', {}, h('strong', { ref }, identity));
  }
  const view = await mountView(() => h(Identity));
  const name = view.container.querySelector('strong')!;
  expect(name.style.fontSize).toBe('');
  // The real stylesheet provides the starting size; supply it for this geometry test.
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = computed(element);
    return new Proxy(style, {
      get: (target, key) => (key === 'fontSize' ? name.style.fontSize || '184px' : Reflect.get(target, key))
    });
  });
  identity = 'A LONG SPONSOR PREFIX PLAYER';
  await view.rerender();
  expect(parseFloat(name.style.fontSize)).toBeLessThan(184);
  expect(name.scrollWidth).toBeLessThanOrEqual(900);
  identity = 'TEAM PLAYER';
  await view.rerender();
  expect(name.style.fontSize).toBe('');
});
