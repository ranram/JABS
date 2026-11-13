// @vitest-environment happy-dom
import { photoTransport, photo } from './scoreboardPhotoTestHarness';
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import type { LibraryPlayer } from '@shared/playerLibrary';
import {
  scoreboardPhotoLayout,
  scoreboardPhotoPlacement,
  scoreboardPhotoViewBox,
  scoreboardPhotoViewport
} from '@shared/scoreboardPhotos';
import { mountView } from '../../hooks/hookTestHarness';
import { invalidateCatalogConsumers } from '../../hooks/useCatalogRevision';
import { ScoreboardPlayerPhotos } from './ScoreboardPlayerPhotos';
import { PlayerPhotoFraming, PhotoFramingContext } from '../players/PlayerPhotoFraming';
import { PlayerHeadshotEditor } from '../players/PlayerHeadshotEditor';

const transport = photoTransport();

it('keeps automatic framing consistent between the editor and OBS', async () => {
  transport.enabled = true;
  transport.resolve.mockResolvedValue({ photos: [{ ...photo('portrait'), autoFrame: true }] });
  let player: LibraryPlayer = {
    localId: '1'.repeat(32),
    playerId: null,
    imported: {
      name: 'One',
      prefix: null,
      xHandle: null,
      pronouns: null,
      country: null,
      state: null,
      profileSlug: null
    },
    overrides: {},
    aliases: [],
    games: [],
    updatedAt: '',
    seenAt: ''
  };
  let selectedSet = createTestOverlayState('street-fighter-6').selectedSet;
  const changed = vi.fn();
  const view = await mountView(() =>
    h(
      MantineProvider,
      {},
      h(
        PhotoFramingContext.Provider,
        { value: transport.framing },
        h(PlayerHeadshotEditor, { player, selectedSet, onChange: changed })
      ),
      h(ScoreboardPlayerPhotos, { selectedSet })
    )
  );
  function expectSameFit() {
    const layout = scoreboardPhotoLayout(selectedSet)!;
    const { width: w, height: h } = scoreboardPhotoViewport(layout, 'left', transport.framing);
    const box = scoreboardPhotoViewBox({ ...photo('portrait'), autoFrame: true, width: 600, height: 900 }, w / h);
    const expected = `${box.x} ${box.y} ${box.width} ${box.height}`;
    expect(view.container.querySelector('.headshot-framing-preview svg[viewBox]')!.getAttribute('viewBox')).toBe(
      expected
    );
    expect(
      view.container.querySelector('[data-scoreboard-photo-side=left] svg[viewBox]')!.getAttribute('viewBox')
    ).toBe(expected);
    expect(changed).not.toHaveBeenCalled();
  }
  expectSameFit();
  transport.framing = 'extendAbove';
  await view.rerender();
  expectSameFit();
  const requests = transport.resolve.mock.calls.length;
  selectedSet = { ...selectedSet, gameId: 'guilty-gear-strive', assetCatalogSlug: 'guilty-gear-strive' };
  await view.rerender();
  expectSameFit();
  expect(transport.resolve).toHaveBeenCalledTimes(requests);
  // A replaced asset must not reuse the old manual crop or either mode's placements.
  player = {
    ...player,
    scoreboardPhoto: {
      ...photo('portrait'),
      fingerprint: 'abcdef1234567890',
      crop: { x: 0.2, y: 0.4, zoom: 2 },
      placements: { 'guilty-gear-strive': { left: { x: 0.3, y: 0.2, scale: 2, flipped: true } } }
    }
  };
  await act(async () => invalidateCatalogConsumers());
  await view.rerender();
  expectSameFit();
  const image = view.container.querySelector('.headshot-framing-preview g[role=img]')!;
  expect(image.getAttribute('transform')).toContain('scale(1 1)');
  expect(view.container.textContent).toContain('This image changed.');
  expect(player.scoreboardPhoto!.crop).toEqual({ x: 0.2, y: 0.4, zoom: 2 });

  transport.resolve.mockResolvedValue({ photos: [{ ...photo('silhouette'), autoFrame: true }] });
  await act(async () => invalidateCatalogConsumers());
  await view.rerender();
  const previewBox = view.container.querySelector('.headshot-framing-preview svg[viewBox]')!.getAttribute('viewBox')!;
  expect(view.container.querySelector('[data-scoreboard-photo-side=left] svg[viewBox]')!.getAttribute('viewBox')).toBe(
    previewBox
  );
  expect(Number(previewBox.split(' ')[3])).toBeLessThan(900 * 0.5);
  expect(changed).not.toHaveBeenCalled();
});

it('Auto frame replaces manual framing for the selected side', async () => {
  transport.resolve.mockResolvedValue({ photos: [{ ...photo('padded-logo'), fingerprint: '1234567890abcdef' }] });
  let current: LibraryPlayer = {
    localId: '1'.repeat(32),
    playerId: null,
    imported: {
      name: 'One',
      prefix: null,
      xHandle: null,
      pronouns: null,
      country: null,
      state: null,
      profileSlug: null
    },
    overrides: {},
    aliases: [],
    games: [],
    updatedAt: '',
    seenAt: '',
    scoreboardPhoto: {
      ...photo('padded-logo'),
      crop: { x: 0.2, y: 0.4, zoom: 2 },
      placements: { '2xko': { left: { x: 0.012, y: -0.05, scale: 1.04, flipped: true } } }
    }
  };
  const view = await mountView(() =>
    h(
      MantineProvider,
      {},
      h(PlayerPhotoFraming, {
        children: h(PlayerHeadshotEditor, {
          player: current,
          gameKey: '2xko',
          selectedSet: createTestOverlayState('2xko').selectedSet,
          onChange: (next) => {
            current = { ...current, scoreboardPhoto: next };
          }
        })
      })
    )
  );
  const box = view.container.querySelector('.headshot-framing-preview svg[viewBox]')!.getAttribute('viewBox')!;
  expect(Number(box.split(' ')[2])).toBe(540);
  const auto = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Auto frame')!;
  await act(async () => auto.click());
  expect(current.scoreboardPhoto!.autoFrame).toBe(true);
  expect(current.scoreboardPhoto!.crop).not.toEqual({ x: 0.2, y: 0.4, zoom: 2 });
  expect(scoreboardPhotoPlacement(current.scoreboardPhoto!, '2xko', 'left')).toEqual({
    x: 0,
    y: 0,
    scale: 1,
    flipped: false
  });
});
