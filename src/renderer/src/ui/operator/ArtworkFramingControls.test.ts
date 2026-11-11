// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import {
  artworkFramingKeys,
  artworkPlacement,
  updateArtworkFraming,
  type ArtworkFraming
} from '@shared/artworkFraming';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { ArtworkFramingControls } from './ArtworkFramingControls';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('edits artwork on both sides and limits result framing to the winner', async () => {
  await initializeI18n();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(100);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(100);
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const right = this.closest('.player-stats[data-player="2"], .highlight[data-player="2"]');
    return new DOMRect(right ? 1000 : 0, 0, this.classList.contains('artwork-framing-canvas') ? 1920 : 900, 900);
  });
  const captures = new WeakMap<HTMLElement, number>();
  vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(function (this: HTMLElement, id) {
    captures.set(this, id);
  });
  vi.spyOn(HTMLElement.prototype, 'hasPointerCapture').mockImplementation(function (this: HTMLElement, id) {
    return captures.get(this) === id;
  });
  vi.spyOn(HTMLElement.prototype, 'releasePointerCapture').mockImplementation(function (this: HTMLElement) {
    captures.delete(this);
  });
  const selected = createTestOverlayState().selectedSet;
  selected.playerOne.characters = selected.playerTwo.characters = ['Ryu'];
  selected.playerOne.character = selected.playerTwo.character = 'Ryu';
  selected.playerOne.playerId = '101';
  selected.playerTwo.playerId = '102';
  const media = [
    {
      characterUrl: 'art',
      characterAssetId: 'Ryu.webp',
      characterFrame: { top: 0.04, aspectRatio: 640 / 900 },
      photoUrl: 'one',
      photoAssetId: 'one.webp'
    },
    {
      characterUrl: 'art',
      characterAssetId: 'Ryu.webp',
      characterFrame: { top: 0.04, aspectRatio: 640 / 900 },
      photoUrl: 'two',
      photoAssetId: 'two.webp'
    }
  ] as const;
  let framing: ArtworkFraming = {};
  let layout: 'stats' | 'classic' | 'victory' | 'spotlight' | 'highlight' = 'stats';
  let winnerSide: 0 | 1 | undefined;
  let showPhoto = true;
  let showCharacter = true;
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(ArtworkFramingControls, {
        activeSet: selected,
        framing,
        layout,
        winnerSide,
        showCharacter,
        showPhoto,
        media: [...media],
        ready: true,
        onChange(key, transform, mirroredKey, mirrorX) {
          framing = updateArtworkFraming(framing, key, transform, mirroredKey, mirrorX);
        }
      })
    )
  );
  expect(view.container.querySelectorAll('.artwork-preview-subject')).toHaveLength(2);
  expect(view.container.querySelector('.versus-preview-shell')).not.toBeNull();
  const keys = artworkFramingKeys(selected, selected.playerOne, 'stats', media[0], 0);
  const otherKeys = artworkFramingKeys(selected, selected.playerTwo, 'stats', media[1], 1);
  const linkedPlayer = { ...selected.playerOne, localPlayerId: 'local-alpha' };
  expect(artworkFramingKeys(selected, linkedPlayer, 'stats', media[0], 0).photo).toBe(keys.photo);
  const oldLocalKey = artworkFramingKeys(
    selected,
    { ...linkedPlayer, playerId: undefined },
    'stats',
    media[0],
    0
  ).photo;
  const oldPhoto = { x: 0.2, y: -0.1, scale: 1.5, flipped: true };
  expect(
    artworkPlacement({ [oldLocalKey]: oldPhoto }, artworkFramingKeys(selected, linkedPlayer, 'stats', media[0], 0))
      .photo
  ).toEqual(oldPhoto);

  const photo = view.container.querySelector<HTMLImageElement>('[data-player="1"] .victory-player-photo')!;
  async function clickImage(ctrlKey = false, target = photo, x = 450, dragX = 0) {
    await act(async () => {
      target.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: 450, ctrlKey })
      );
      if (dragX) {
        target.dispatchEvent(
          new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: x + dragX, clientY: 450 })
        );
      }
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    });
  }
  await clickImage();
  expect(photo.classList.contains('is-selected')).toBe(true);
  await act(async () => {
    photo.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    photo.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(framing[keys.photo].flipped).toBe(true);
  expect(framing[keys.character]).toBeUndefined();
  await view.rerender();
  await clickImage(true);
  const character = view.container.querySelector<HTMLImageElement>('[data-player="1"] .victory-character-art')!;
  expect(character.classList.contains('is-selected')).toBe(true);
  framing[keys.character] = { x: 0.2, y: -0.1, scale: 6, flipped: false };
  await view.rerender();
  await act(async () => {
    character.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
    character.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(framing[keys.character].scale).toBeCloseTo(5.96);
  expect(framing[otherKeys.character].scale).toBeCloseTo(5.96);
  expect(framing[otherKeys.character].x).toBe(-0.2);
  expect(framing[otherKeys.character].flipped).toBe(false);
  expect(framing[keys.photo].flipped).toBe(true);
  expect(artworkPlacement(framing, otherKeys).photo.scale).toBe(1);
  await view.rerender();
  const rightPhoto = view.container.querySelector<HTMLImageElement>('[data-player="2"] .victory-player-photo')!;
  await clickImage(true, rightPhoto, 1450);
  const rightCharacter = view.container.querySelector<HTMLImageElement>('[data-player="2"] .victory-character-art')!;
  expect(rightCharacter.classList.contains('is-selected')).toBe(true);
  await act(async () => {
    rightCharacter.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    rightCharacter.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  expect(framing[otherKeys.character].flipped).toBe(true);
  expect(framing[keys.character].flipped).toBe(false);

  showPhoto = false;
  await view.rerender();
  expect(view.container.querySelector('.victory-player-photo')).toBeNull();
  const characterOnly = view.container.querySelector<HTMLImageElement>('[data-player="2"] .victory-character-art')!;
  expect(characterOnly.style.transform).toContain('scale(1)');
  await act(async () => {
    characterOnly.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    characterOnly.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  const characterOnlyKeys = artworkFramingKeys(selected, selected.playerTwo, 'stats:character', media[1], 1);
  expect(framing[characterOnlyKeys.character].scale).toBeCloseTo(1.04);
  expect(framing[otherKeys.character].scale).toBeCloseTo(5.96);
  showPhoto = true;
  await view.rerender();
  expect(
    view.container.querySelector<HTMLElement>('[data-player="2"] .victory-character-art')!.style.transform
  ).toContain('scale(5.96)');
  showCharacter = false;
  await view.rerender();
  expect(view.container.querySelector('.victory-character-art')).toBeNull();
  const photoOnly = view.container.querySelector<HTMLImageElement>('[data-player="1"] .victory-player-photo')!;
  await clickImage(false, photoOnly);
  await act(async () => {
    photoOnly.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    photoOnly.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  const photoOnlyKeys = artworkFramingKeys(selected, selected.playerOne, 'stats:photo', media[0], 0);
  expect(framing[photoOnlyKeys.photo].scale).toBeCloseTo(1.04);
  expect(framing[keys.photo].scale).toBe(1);
  showPhoto = false;
  await view.rerender();
  expect(view.container.querySelector('.keyboard-adjustable-media')).toBeNull();
  expect(view.container.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
  showPhoto = showCharacter = true;
  layout = 'victory';
  await view.rerender();
  expect(view.container.querySelector('.artwork-framing-canvas')).toBeNull();
  winnerSide = 1;
  await view.rerender();
  expect(view.container.querySelectorAll('.artwork-preview-subject')).toHaveLength(1);
  expect(view.container.querySelector('.artwork-preview-subject')?.getAttribute('data-player')).toBe('2');
  expect(view.container.querySelector('[data-player="1"]')).toBeNull();
  for (const fixedLayout of ['classic', 'victory', 'spotlight'] as const) {
    layout = fixedLayout;
    await view.rerender();
    const character = view.container.querySelector<HTMLImageElement>(
      layout === 'classic' ? '.announcement-character-art' : '.victory-character-art'
    )!;
    await clickImage(true, character, 450, 40);
    await act(async () => {
      for (const key of ['ArrowRight', '+', 'f']) {
        character.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
      character.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    const fixedKeys = artworkFramingKeys(selected, selected.playerTwo, layout, media[1], 1);
    expect(framing[fixedKeys.character].x).toBeGreaterThan(0);
    expect(framing[fixedKeys.character].scale).toBeCloseTo(1.04);
    expect(framing[fixedKeys.character].flipped).toBe(true);
    expect(framing[fixedKeys.mirroredCharacter]).toMatchObject({
      x: framing[fixedKeys.character].x,
      scale: 1.04,
      flipped: false
    });
    await view.rerender();
    const photo = view.container.querySelector<HTMLImageElement>(
      layout === 'classic' ? '.announcement-player-photo' : '.victory-player-photo'
    )!;
    await clickImage(false, photo, 450, -25);
    await act(async () => {
      for (const key of ['ArrowLeft', '+', 'f']) {
        photo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
      photo.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(framing[fixedKeys.photo].x).toBeLessThan(0);
    expect(framing[fixedKeys.photo]).toMatchObject({ scale: 1.04, flipped: true });
    await view.rerender();
    const reset = [...view.container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Reset position'
    )!;
    await act(async () => reset.click());
    expect(framing[fixedKeys.photo]).toEqual({ x: 0, y: 0, scale: 1, flipped: false });
    expect(framing[fixedKeys.character].scale).toBeCloseTo(1.04);
    winnerSide = 0;
    await view.rerender();
    const firstKeys = artworkFramingKeys(selected, selected.playerOne, layout, media[0], 0);
    expect(artworkPlacement(framing, firstKeys).character.x).toBe(framing[fixedKeys.character].x);
    expect(artworkPlacement(framing, firstKeys).photo.scale).toBe(1);
    winnerSide = 1;
  }
  layout = 'highlight';
  await view.rerender();
  const highlightArt = view.container.querySelector<HTMLImageElement>('.victory-character-art')!;
  const initialY = highlightArt.style.transform.match(/translate3d\([^,]+,\s*([^,]+)/)![1];
  await clickImage(true, highlightArt, 1450);
  await act(async () => {
    highlightArt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    highlightArt.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  const highlightKeys = artworkFramingKeys(selected, selected.playerTwo, 'highlight', media[1], 1);
  expect(framing[highlightKeys.character].y).toBeLessThan(0);
  expect(framing[highlightKeys.character].x).toBeGreaterThan(0);
  await view.rerender();
  expect(view.container.querySelector<HTMLImageElement>('.victory-character-art')!.style.transform).toContain(
    `, ${initialY},`
  );
  await view.unmount();
});
