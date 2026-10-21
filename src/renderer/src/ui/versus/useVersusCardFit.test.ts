// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mountHook } from '../../hooks/hookTestHarness';
import { useVersusCardFit } from './useVersusCardFit';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('fits dense content and smaller viewports without scaling the frame or bottom footer', async () => {
  let height = 838.375;
  let frameHeight = 1080;
  let visible = true;
  let resize: (includeCard?: boolean) => void = () => {};
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => (visible ? 814 : 0));
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => (visible ? frameHeight - 2 : 0));
  // Layout is simulated, but computed CSS keeps its real fractional height.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (!visible) return 0;
    if (this.classList.contains('versus-center-card')) return frameHeight;
    return this.classList.contains('versus-match-body') ? Math.round(height) : 40;
  });
  const NativeObserver = globalThis.ResizeObserver;
  vi.stubGlobal(
    'ResizeObserver',
    class extends NativeObserver {
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        resize = (includeCard = true) =>
          callback(
            [
              {
                target: document.querySelector('.versus-match-body'),
                borderBoxSize: [{ blockSize: visible ? height : 0, inlineSize: visible ? 816 : 0 }]
              } as unknown as ResizeObserverEntry,
              {
                target: document.querySelector('.versus-center-card'),
                borderBoxSize: [{ blockSize: visible ? frameHeight : 0, inlineSize: visible ? 816 : 0 }]
              } as unknown as ResizeObserverEntry
            ].slice(0, includeCard ? 2 : 1),
            this
          );
      }
    }
  );
  const view = await mountHook(useVersusCardFit, false, (ref) =>
    h(
      'main',
      { style: visible ? undefined : { display: 'none' } },
      h(
        'section',
        { ref, className: 'versus-center-card', style: { height: frameHeight, border: '1px solid' } },
        h('div', { className: 'versus-match-body', style: { height, marginBottom: 18 } }),
        h('footer', { className: 'versus-match-footer', style: { height: 40, position: 'absolute', bottom: 0 } })
      )
    )
  );
  const stage = view.container.querySelector('main')!;
  const card = stage.querySelector<HTMLElement>('.versus-center-card')!;
  expect(card.style.height).toBe('1080px');
  expect(card.style.getPropertyValue('--versus-body-scale') || '1').toBe('1');
  height = 1174.625;
  await view.rerender();
  resize();
  expect(Number(card.style.getPropertyValue('--versus-body-scale')) * (height + 18) + 40 + 2).toBeCloseTo(1079, 10);
  const stableScale = card.style.getPropertyValue('--versus-body-scale');
  // Browser zoom can alternate between these natural heights on each resize.
  // A dense card must stop correcting subpixel differences once it fits.
  for (const fluctuation of [0.2, -0.3, 0.1, -0.2, 0]) {
    height = 1174.625 + fluctuation;
    resize();
    expect(card.style.getPropertyValue('--versus-body-scale')).toBe(stableScale);
  }
  // Artwork reloads can resize the visible names while their width refits.
  // Those observations must not become the next natural-height measurement.
  for (const observedHeight of [1250, 1100, 1250, 1174.625]) {
    height = observedHeight;
    resize();
    expect(card.style.getPropertyValue('--versus-body-scale')).toBe(stableScale);
    expect(card.querySelectorAll('.versus-match-body')).toHaveLength(1);
  }
  expect(card.style.height).toBe('1080px');
  expect(stage.style.length).toBe(0);
  // Closing the accordion reports zero sizes. Keep the last good fit rather
  // than squeezing the content into a one-pixel available height.
  visible = false;
  await view.rerender();
  resize();
  expect(card.style.getPropertyValue('--versus-body-scale')).toBe(stableScale);
  frameHeight = 720;
  visible = true;
  await view.rerender();
  // The body may report before the card after reopening. A cached zero frame
  // height must not keep the center collapsed while the other artwork is fine.
  resize(false);
  expect(Number(card.style.getPropertyValue('--versus-body-scale')) * (height + 18) + 40 + 2).toBeCloseTo(719, 10);
  frameHeight = 1080;
  height = 693.125;
  await view.rerender();
  resize();
  expect(card.style.height).toBe('1080px');
  expect(card.style.getPropertyValue('--versus-body-scale')).toBe('1');
  await view.unmount();
});
