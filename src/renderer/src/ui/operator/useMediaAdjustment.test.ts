// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultMediaTransform } from '@shared/mediaPlacement';
import { mountView } from '../../hooks/hookTestHarness';
import { AdjustableMediaImage } from './AdjustableMediaImage';

const originalPixelRatio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
beforeEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  vi.useFakeTimers();
  const captures = new Set<number>();
  vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation((id) => {
    captures.add(id);
  });
  vi.spyOn(Element.prototype, 'hasPointerCapture').mockImplementation((id) => captures.has(id));
  vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation((id) => {
    captures.delete(id);
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 562.5));
});
afterEach(() => {
  if (originalPixelRatio) Object.defineProperty(window, 'devicePixelRatio', originalPixelRatio);
  else Reflect.deleteProperty(window, 'devicePixelRatio');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function editor() {
  const model = { src: 'first.png', transform: defaultMediaTransform() };
  const change = vi.fn();
  const view = await mountView(() =>
    h(
      'div',
      { className: 'thumbnail-canvas' },
      h(AdjustableMediaImage, {
        src: model.src,
        transform: model.transform,
        selected: true,
        label: 'Player artwork',
        className: 'artwork',
        onSelect() {},
        onChange: change
      })
    )
  );
  const image = view.container.querySelector('img')!;
  return {
    model,
    change,
    view,
    image,
    async pointer(type: string, x: number, pointerId = 1) {
      await act(async () =>
        image.dispatchEvent(
          new PointerEvent(type, {
            button: 0,
            pointerId,
            clientX: x,
            clientY: 100,
            bubbles: true
          })
        )
      );
    }
  };
}

it('discards captured drags when the image changes or its placement is reset', async () => {
  const { model, change, view, image, pointer } = await editor();
  await pointer('pointerdown', 100);
  await pointer('pointermove', 150);
  model.src = 'replacement.png';
  await view.rerender();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(change).not.toHaveBeenCalled();

  await pointer('pointerdown', 100);
  await pointer('pointermove', 150);
  model.transform = { ...defaultMediaTransform(), scale: 0.8 };
  await view.rerender();
  expect(image.hasPointerCapture(1)).toBe(false);
  await pointer('pointermove', 250);
  await pointer('pointerup', 250);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(change).not.toHaveBeenCalled();
  expect(image.style.transform).toContain('scale(0.8)');
});

it('keeps a second pointer and keyboard edits from stealing an active drag', async () => {
  const { change, image, pointer } = await editor();
  await pointer('pointerdown', 100);
  await pointer('pointerdown', 200, 2);
  await act(async () => image.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true })));
  await pointer('pointermove', 150);
  await pointer('pointerup', 150);
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...defaultMediaTransform(), x: 0.1 });
});

it('commits the final keyboard nudge before the editor is closed', async () => {
  const { view, image, change } = await editor();
  await act(async () => image.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...defaultMediaTransform(), x: 0.012 });
  await view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(change).toHaveBeenCalledOnce();
});

it('previews held keys without repeated commits and saves their final size and position on release', async () => {
  const { model, view, image, change } = await editor();
  async function key(type: string, key: string, repeat = false) {
    await act(async () => image.dispatchEvent(new KeyboardEvent(type, { key, repeat, bubbles: true })));
  }
  const shownScale = () => Number(image.style.transform.match(/scale\(([^)]+)\)/)![1]);
  await key('keydown', '+');
  model.transform = change.mock.calls.at(-1)![0];
  await view.rerender();
  for (let index = 0; index < 20; index++) await key('keydown', '+', true);
  expect(change).toHaveBeenCalledOnce();
  expect(shownScale()).toBeCloseTo(1.84);

  // An acknowledgement of the earlier tap cannot undo the held-key preview.
  model.transform = { ...model.transform };
  await view.rerender();
  expect(shownScale()).toBeCloseTo(1.84);
  await key('keyup', '+');
  expect(change).toHaveBeenCalledTimes(2);
  expect(change.mock.calls.at(-1)![0].scale).toBeCloseTo(1.84);

  await key('keydown', 'ArrowRight');
  for (let index = 0; index < 10; index++) await key('keydown', 'ArrowRight', true);
  expect(change).toHaveBeenCalledTimes(3);
  await key('keyup', 'ArrowRight');
  expect(change.mock.calls.at(-1)![0].x).toBeCloseTo(0.132);

  await key('keydown', '-');
  for (let index = 0; index < 3; index++) await key('keydown', '-', true);
  await act(async () => window.dispatchEvent(new Event('blur')));
  expect(change.mock.calls.at(-1)![0].scale).toBeCloseTo(1.68);
  const commits = change.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(change).toHaveBeenCalledTimes(commits);

  // Resetting to the earlier saved value still replaces the local preview.
  model.transform = { ...defaultMediaTransform() };
  await view.rerender();
  expect(image.style.transform).toContain('scale(1)');
});

it.each(['blur', 'hidden', 'resize'])('finishes and releases an interrupted drag on %s', async (reason) => {
  const { image, change, pointer } = await editor();
  await pointer('pointerdown', 100);
  await pointer('pointermove', 150);
  await act(async () => {
    if (reason === 'hidden') {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
    } else window.dispatchEvent(new Event(reason));
  });
  expect(change).toHaveBeenCalledExactlyOnceWith({ ...defaultMediaTransform(), x: 0.1 });
  expect(image.hasPointerCapture(1)).toBe(false);
  await pointer('pointermove', 300);
  await pointer('pointerup', 300);
  expect(change).toHaveBeenCalledOnce();
  await pointer('pointerdown', 100);
  expect(image.hasPointerCapture(1)).toBe(true);
  await pointer('pointerup', 100);
});

it.each(['size', 'pixel ratio', 'scroll'])(
  'keeps the last position when preview %s changes mid-drag',
  async (changeType) => {
    const { image, change, pointer } = await editor();
    await pointer('pointerdown', 100);
    await pointer('pointermove', 150);
    if (changeType === 'pixel ratio')
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.25 });
    else
      vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(
        changeType === 'size' ? new DOMRect(0, 0, 500, 281.25) : new DOMRect(0, 30, 1000, 562.5)
      );
    await pointer('pointermove', 300);
    expect(change).toHaveBeenCalledExactlyOnceWith({ ...defaultMediaTransform(), x: 0.1 });
    expect(image.hasPointerCapture(1)).toBe(false);
  }
);
