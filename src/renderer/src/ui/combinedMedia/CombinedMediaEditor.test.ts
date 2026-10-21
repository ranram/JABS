// @vitest-environment happy-dom
import { act, createElement as h, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultPlayerMediaPlacement, type MediaLayerKind } from '@shared/mediaPlacement';
import { mountView } from '../../hooks/hookTestHarness';
import { PlayerMediaLayers } from '../PlayerMediaLayers';
import { imageContainsPixel } from './imageHitTest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('selects visible pixels, locks each drag, and preserves independent placements within bounds', async () => {
  const { captures, readback } = mockMediaCanvas();
  let placement = defaultPlayerMediaPlacement();
  const render = vi.fn();
  function Preview() {
    render();
    const [current, setPlacement] = useState(placement);
    const [selected, select] = useState<MediaLayerKind>();
    placement = current;
    return h(
      'div',
      { className: 'thumbnail-canvas' },
      h(PlayerMediaLayers, {
        mode: 'combined',
        name: 'Player one',
        characterUrl: 'character.png',
        photoUrl: 'photo.png',
        characterClass: 'thumbnail-character-art',
        photoClass: 'thumbnail-player-photo',
        placement: current,
        selectedLayer: selected,
        onSelect: select,
        onChange: (layer, transform) => setPlacement((previous) => ({ ...previous, [layer]: transform }))
      })
    );
  }
  const view = await mountView(() => h(Preview));
  const root = view.container.querySelector<HTMLElement>('.combined-media-editor')!;
  const character = root.querySelector<HTMLImageElement>('.player-media-character')!;
  const photo = root.querySelector<HTMLImageElement>('.player-media-photo')!;
  const pointer = async (target: Element, type: string, x: number, altKey = false, id = 1) => {
    await act(async () => {
      target.dispatchEvent(
        new PointerEvent(type, { bubbles: true, button: 0, pointerId: id, clientX: x, clientY: 150, altKey })
      );
    });
  };
  await pointer(photo, 'pointerdown', 150); // Transparent photo pixels reveal the character.
  expect(character.classList.contains('is-selected')).toBe(true);
  expect(captures.get(1)).toBe(root);
  await pointer(photo, 'pointerdown', 250, false, 2); // A second pointer cannot steal the drag.
  const rendersBeforeMovement = render.mock.calls.length;
  await pointer(root, 'pointermove', 250);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  expect(character.style.transform).toContain('translate3d(10cqw,');
  expect(render).toHaveBeenCalledTimes(rendersBeforeMovement);
  expect(placement.character.x).toBe(0);
  expect(placement.photo.x).toBe(0);
  await pointer(root, 'pointerup', 250);
  expect(placement.character.x).toBe(0.2);
  expect(readback).toHaveBeenCalledTimes(2); // No pixel readback while dragging.
  await pointer(photo, 'pointerdown', 250);
  expect(photo.classList.contains('is-selected')).toBe(true);
  await pointer(root, 'pointermove', 200);
  await pointer(root, 'pointercancel', 200);
  expect(placement.photo.x).toBe(-0.1);
  expect(captures.size).toBe(0);
  await pointer(photo, 'pointerdown', 250, true);
  expect(character.classList.contains('is-selected')).toBe(true);
  await pointer(root, 'lostpointercapture', 250);
  await pointer(photo, 'pointerdown', 250);
  await pointer(root, 'pointerup', 250);
  await act(async () => {
    photo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  await pointer(photo, 'pointerdown', 250); // Flush a queued key edit before starting another drag.
  await pointer(root, 'pointermove', 300);
  await pointer(root, 'pointerup', 300);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(placement.photo.x).toBeCloseTo(0.012);
  expect(placement.character.x).toBe(0.2);
  // The alpha mask follows mirroring without another canvas read.
  photo.style.transform = 'scaleX(-1)';
  expect(imageContainsPixel(photo, 150, 150)).toBe(true);
  expect(imageContainsPixel(photo, 250, 150)).toBe(false);
  expect(readback).toHaveBeenCalledTimes(2);
  await view.rerender();
  expect(placement.photo.x).toBeCloseTo(0.012);
  expect(placement.character.x).toBe(0.2);
  photo.style.transform = '';
  await pointer(photo, 'pointerdown', 250);
  await pointer(root, 'pointermove', 10000);
  await pointer(root, 'pointerup', 10000);
  expect(placement.photo.x).toBe(0.85);
  expect(placement.character.x).toBe(0.2);
});

function mockMediaCanvas() {
  vi.useFakeTimers();
  const captures = new Map<number, Element>();
  vi.spyOn(Element.prototype, 'setPointerCapture').mockImplementation(function (this: Element, id) {
    captures.set(id, this);
  });
  vi.spyOn(Element.prototype, 'hasPointerCapture').mockImplementation(function (this: Element, id) {
    return captures.get(id) === this;
  });
  vi.spyOn(Element.prototype, 'releasePointerCapture').mockImplementation((id) => {
    captures.delete(id);
  });
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(2);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(2);
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.matches('.thumbnail-canvas, .top8-canvas, .versus-preview-canvas')
      ? new DOMRect(0, 0, 1000, 562.5)
      : new DOMRect(100, 100, 200, 200);
  });
  const readback = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    let photo = false;
    return {
      drawImage(image: HTMLImageElement) {
        photo = image.src.includes('photo');
      },
      getImageData() {
        readback();
        return {
          data: new Uint8ClampedArray([0, 0, 0, photo ? 0 : 255, 0, 0, 0, 255, 0, 0, 0, photo ? 0 : 255, 0, 0, 0, 255])
        };
      }
    } as unknown as CanvasRenderingContext2D;
  });
  return { captures, readback };
}

it.each(['image', 'composition', 'reset'] as const)(
  'cancels a combined drag when its %s changes before the edit is saved',
  async (change) => {
    const { captures } = mockMediaCanvas();
    let mode: 'combined' | 'character' = 'combined';
    let characterUrl = 'character.png';
    let placement = defaultPlayerMediaPlacement();
    const commit = vi.fn();
    const view = await mountView(() =>
      h(
        'div',
        { className: 'thumbnail-canvas' },
        h(PlayerMediaLayers, {
          mode,
          name: 'Player One',
          characterUrl,
          photoUrl: 'photo.png',
          characterClass: 'character',
          photoClass: 'photo',
          placement,
          onSelect() {},
          onChange: commit
        })
      )
    );
    const pointer = async (target: Element, type: string, x: number) => {
      await act(async () =>
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            button: 0,
            pointerId: 1,
            clientX: x,
            clientY: 150
          })
        )
      );
    };
    const original = view.container.querySelector('.combined-media-editor')!;
    await pointer(original, 'pointerdown', 150);
    await pointer(original, 'pointermove', 250);
    if (change !== 'composition') {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
    }
    if (change === 'image') characterUrl = 'replacement.png';
    if (change === 'composition') mode = 'character';
    if (change === 'reset') placement = { ...placement, character: { ...placement.character, scale: 0.8 } };
    await view.rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(commit).not.toHaveBeenCalled();
    const current = view.container.querySelector('.combined-media-editor');
    if (current) {
      await pointer(current, 'pointermove', 350);
      await pointer(current, 'pointerup', 350);
    }
    expect(commit).not.toHaveBeenCalled();
    expect(captures.size).toBe(0);
  }
);

it.each(['blur', 'resize'])('finishes the combined drag on window %s without leaving capture behind', async (event) => {
  const { captures } = mockMediaCanvas();
  const commit = vi.fn();
  const view = await mountView(() =>
    h(
      'div',
      { className: 'thumbnail-canvas' },
      h(PlayerMediaLayers, {
        mode: 'combined',
        name: 'Player One',
        characterUrl: 'character.png',
        photoUrl: 'photo.png',
        characterClass: 'character',
        photoClass: 'photo',
        placement: defaultPlayerMediaPlacement(),
        onSelect() {},
        onChange: commit
      })
    )
  );
  const root = view.container.querySelector('.combined-media-editor')!;
  await act(async () => {
    root.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 150, clientY: 150, bubbles: true })
    );
    root.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 250, clientY: 150, bubbles: true }));
    window.dispatchEvent(new Event(event));
  });
  expect(commit).toHaveBeenCalledExactlyOnceWith('character', { x: 0.2, y: 0, scale: 1, flipped: false });
  expect(captures.size).toBe(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(commit).toHaveBeenCalledOnce();
});
