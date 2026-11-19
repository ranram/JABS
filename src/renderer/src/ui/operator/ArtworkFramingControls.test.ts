// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { characterFramingGroup } from '@shared/characterAssets';
import {
  artworkFramingKeys,
  artworkPlacement,
  updateArtworkPlacement,
  type ArtworkFraming
} from '@shared/artworkFraming';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { ArtworkFramingControls } from './ArtworkFramingControls';
import { ShareArtworkFraming } from './ShareArtworkFraming';
import { api } from '../../api';
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
        onChange(applyFraming) {
          framing = applyFraming(framing);
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

it.each([false, true])('manages shared artwork framing with existing groups: %s', async (moving) => {
  await initializeI18n();
  const match = createTestOverlayState().selectedSet;
  const player = { ...match.playerOne, character: 'Ryu', characters: ['Ryu'] };
  const extraGroups = moving
    ? Array.from({ length: 4 }, (_, index) => ({
        number: 20 + index,
        anchor: `Ryu-${20 + index}.webp`,
        members: [],
        useSharedForAdjusted: false
      }))
    : [];
  const groups = moving
    ? [
        { number: 4, anchor: 'Ryu.webp', members: ['Ryu-16.webp'], useSharedForAdjusted: false },
        { number: 7, anchor: 'Ryu-17.webp', members: ['Ryu-18.webp'], useSharedForAdjusted: false },
        ...extraGroups
      ]
    : [];
  const catalog = {
    assets: [
      {
        character: 'Ryu',
        assetId: 'Ryu.webp',
        variants: [
          { label: '16', assetId: 'Ryu-16.webp' },
          { label: '17', assetId: 'Ryu-17.webp' },
          { label: '18', assetId: 'Ryu-18.webp' },
          ...extraGroups.map(({ number, anchor }) => ({ label: String(number), assetId: anchor }))
        ]
      },
      { character: 'Ken', assetId: 'Ken.webp', variants: [] }
    ],
    framingGroups: groups
  };
  const load = vi.spyOn(api, 'gameCharacterAssets').mockResolvedValue(catalog);
  vi.spyOn(api, 'gameCharacterAssetUrl').mockResolvedValue('data:image/png;base64,');
  const save = vi.spyOn(api, 'saveCharacterFramingGroup').mockResolvedValue(groups);
  const view = await mountView(() =>
    h(MantineProvider, { env: 'test' }, h(ShareArtworkFraming, { game: 'street-fighter-6', player }))
  );
  await act(async () => view.container.querySelector('button')!.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('Ryu-17.webp');
  expect(dialog.textContent).not.toContain('Ken.webp');
  if (moving) {
    const groups = dialog.querySelector('[aria-label="Artwork groups"]')!;
    const search = groups.querySelector<HTMLInputElement>('input[aria-label="Search groups"]')!;
    const searchFor = (value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, value);
        search.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await searchFor('RYU-20');
    expect(groups.textContent).toContain('Group #20');
    expect(groups.textContent).not.toContain('Group #7');
    await searchFor('#7');
    const destination = [...groups.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Group #7')
    )!;
    await act(async () => destination.click());
    expect(destination.getAttribute('aria-pressed')).toBe('true');
    expect(dialog.textContent).toContain('In Group #4');
  }
  const artwork = moving ? 'Ryu.webp' : 'Ryu-17.webp';
  const choice = [...dialog.querySelectorAll('label')].find((label) => label.textContent?.includes(artwork))!;
  await act(async () => document.getElementById(choice.htmlFor)!.click());
  if (moving) expect(dialog.textContent).toContain('Move from Group #4');
  const saveButton = [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Save group')!;
  await act(async () => saveButton.click());
  expect(save).toHaveBeenCalledWith('street-fighter-6', {
    ...(moving ? { number: 7 } : {}),
    anchor: moving ? 'Ryu-17.webp' : 'Ryu.webp',
    members: moving ? ['Ryu-18.webp', 'Ryu.webp'] : ['Ryu-17.webp'],
    useSharedForAdjusted: false
  });
  if (moving) {
    await act(async () => view.container.querySelector('button')!.click());
    const deleteButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (button) => button.textContent === 'Delete group'
    )!;
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);
    await act(async () => deleteButton.click());
    expect(save).toHaveBeenCalledTimes(1);
    const remaining = groups.filter(({ number }) => number !== 4);
    save.mockResolvedValue(remaining);
    load.mockResolvedValue({ ...catalog, framingGroups: remaining });
    await act(async () => deleteButton.click());
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Group #4'));
    expect(save).toHaveBeenLastCalledWith('street-fighter-6', {
      number: 4,
      anchor: 'Ryu.webp',
      members: [],
      useSharedForAdjusted: false
    });
    await act(async () => view.container.querySelector('button')!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('Group #4');
  }
  await view.unmount();
});

it('restores independent Player Stats framing after editing the mirrored placement', () => {
  const set = createTestOverlayState().selectedSet;
  const player = { ...set.playerOne, character: 'Ryu', characters: ['Ryu'] };
  const assets = { characterAssetId: 'Ryu.webp', photoAssetId: 'player.webp' };
  const keys = (side: 0 | 1, mirrored: boolean) =>
    artworkFramingKeys(set, player, 'stats', assets, side, undefined, mirrored);
  const left = keys(0, false);
  const right = keys(1, false);
  const mirrored = keys(0, true);
  const individual = { x: 0.15, y: 0, scale: 1.2, flipped: false };
  const photo = { x: 0.1, y: 0, scale: 1, flipped: false };
  const reflected = { x: 0.25, y: -0.25, scale: 2, flipped: false };
  const framing = updateArtworkPlacement(
    { [right.character]: individual, [left.photo]: photo },
    mirrored,
    'character',
    reflected
  );
  expect(artworkPlacement(framing, keys(1, true)).character).toEqual({ ...reflected, x: -0.25, flipped: true });
  expect(artworkPlacement(framing, right).character).toEqual(individual);
  expect(artworkPlacement(framing, mirrored).photo).toEqual(photo);
});

it('shares grouped artwork geometry without sharing or overwriting flips', () => {
  const set = createTestOverlayState().selectedSet;
  const player = { ...set.playerOne, character: 'Ryu', characters: ['Ryu'] };
  const group = { number: 1, anchor: 'Ryu.webp', members: ['Ryu-17.webp'], useSharedForAdjusted: true };
  for (const [layout, mirror] of [
    ['stats', true],
    ['spotlight', undefined]
  ] as const) {
    let framing: ArtworkFraming = {};
    const keys = (assetId: string, side: 0 | 1, grouped = true) =>
      artworkFramingKeys(
        set,
        player,
        layout,
        {
          characterAssetId: assetId,
          framingGroup: grouped ? characterFramingGroup(assetId, [group]) : undefined
        },
        side,
        framing,
        mirror
      );
    const anchor = keys(group.anchor, 0);
    const member = keys(group.members[0]!, 0);
    framing[anchor.character] = { x: 0.2, y: 0.1, scale: 1.5, flipped: false };
    expect(artworkPlacement(framing, keys(group.anchor, 1)).character.flipped).toBe(mirror === true);
    framing[anchor.mirroredCharacter] = { x: -0.2, y: 0.1, scale: 1.5, flipped: false };
    expect(artworkPlacement(framing, keys(group.anchor, 1)).character.flipped).toBe(mirror === true);
    delete framing[anchor.mirroredCharacter];
    framing[anchor.character] = { x: 0.2, y: 0.1, scale: 1.5, flipped: true };
    expect(artworkPlacement(framing, member).character).toEqual({ x: 0.2, y: 0.1, scale: 1.5, flipped: false });
    const rightMember = keys(group.members[0]!, 1);
    const previousRight = artworkPlacement(framing, rightMember).character;
    expect(previousRight.flipped).toBe(mirror === true);
    expect(artworkPlacement(framing, keys(group.members[0]!, 1, false)).character).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      flipped: mirror === true
    });
    const overrideFlip = mirror !== true;
    framing = updateArtworkPlacement(framing, rightMember, 'character', { ...previousRight, flipped: overrideFlip });
    expect(artworkPlacement(framing, member).character.flipped).toBe(false);
    expect(artworkPlacement(framing, keys(group.anchor, 1)).character.flipped).toBe(mirror === true);
    framing = updateArtworkPlacement(framing, member, 'character', { x: 0.4, y: 0.2, scale: 1.75, flipped: false });
    expect(artworkPlacement(framing, anchor).character).toEqual({ x: 0.4, y: 0.2, scale: 1.75, flipped: true });
    expect(artworkPlacement(framing, rightMember).character).toEqual({
      x: mirror ? -0.4 : 0.4,
      y: 0.2,
      scale: 1.75,
      flipped: overrideFlip
    });
    expect(artworkPlacement(framing, keys(group.members[0]!, 1, false)).character).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      flipped: overrideFlip
    });
  }
});
