// @vitest-environment happy-dom
import { photoTransport } from './scoreboardPhotoTestHarness';
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { expect, it, vi } from 'vitest';
import { createTestOverlayState, createTestCustomScoreboard } from '@shared/testFixtures';
import { scoreboardPhotoLayout } from '@shared/scoreboardPhotos';
import { mountView } from '../../hooks/hookTestHarness';
import { ScoreboardPlayerPhotos } from './ScoreboardPlayerPhotos';
import { StreamBroadcastControls } from '../operator/StreamBroadcastControls';
import { CustomScoreboardCanvas } from '../CustomScoreboardCanvas';

const transport = photoTransport();

it('toggles SF6 character pills below the masks and keeps custom placement fixed and independent', async () => {
  const selectedSet = createTestOverlayState().selectedSet;
  selectedSet.playerOne.character = 'Ryu';
  selectedSet.playerTwo.characters = ['M. Bison'];
  const view = await mountView(() => h(ScoreboardPlayerPhotos, { selectedSet, animateEntrance: false }));
  const controls = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(StreamBroadcastControls, {
        selectedSet,
        broadcast: selectedSet.broadcast,
        isExhibition: false,
        logos: [],
        onChange: vi.fn()
      })
    )
  );
  const characterSwitch = () =>
    controls.container.querySelector<HTMLInputElement>('[data-testid=editor-character-names-enabled]');
  expect(view.container.querySelector('[data-detail=character]')).toBeNull();
  await act(async () => characterSwitch()!.click());
  expect(transport.save).toHaveBeenLastCalledWith(expect.objectContaining({ showCharacterNames: true }));
  await view.rerender();
  const labels = () => [...view.container.querySelectorAll('[data-detail=character]')].map((pill) => pill.textContent);
  const positions = () =>
    [...view.container.querySelectorAll<HTMLElement>('.scoreboard-character-group')].map(
      (group) => group.style.cssText
    );
  expect(labels()).toEqual(['Ryu', 'M. Bison']);
  expect(transport.resolve).not.toHaveBeenCalled();
  const groups = [...view.container.querySelectorAll<HTMLElement>('.scoreboard-character-group')];
  const layout = scoreboardPhotoLayout(selectedSet)!;
  for (const [index, side] of (['left', 'right'] as const).entries()) {
    const [, y, width, height] = layout.sides[side].bounds;
    expect(groups[index].style.top).toBe(`${(y + height + 6) / 10.8}%`);
    expect(groups[index].style[side]).toBe('0px');
    expect(groups[index].style.width).toBe(`${width / 19.2}%`);
  }
  const fixedPositions = positions();
  transport.framing = 'extendAbove';
  await view.rerender();
  expect(positions()).toEqual(fixedPositions);
  selectedSet.stylingGameId = 'tekken-8';
  await view.rerender();
  await controls.rerender();
  expect(labels()).toEqual([]);
  expect(characterSwitch()).toBeNull();

  const scoreboard = createTestCustomScoreboard();
  await view.rerender(() =>
    h(CustomScoreboardCanvas, {
      scoreboard,
      selectedSet,
      frameUrl: 'frame.png',
      onMoveRegion: vi.fn()
    })
  );
  expect(labels()).toEqual([]);
  scoreboard.visibility.characterNames = true;
  await view.rerender();
  expect(labels()).toEqual(['Ryu', 'M. Bison']);
  expect(positions()).toEqual(fixedPositions);
  expect(view.container.querySelector('.scoreboard-character-names [data-custom-scoreboard-region]')).toBeNull();
  scoreboard.playerElements.playerOne.name.x = 500;
  [selectedSet.playerOne, selectedSet.playerTwo] = [selectedSet.playerTwo, selectedSet.playerOne];
  await view.rerender();
  expect(positions()).toEqual(fixedPositions);
  expect(labels()).toEqual(['M. Bison', 'Ryu']);
  selectedSet.stylingGameId = 'street-fighter-6';
  selectedSet.customScoreboardId = scoreboard.id;
  await controls.rerender();
  expect(characterSwitch()).toBeNull();
  selectedSet.gameId = '2xko';
  selectedSet.assetCatalogSlug = '2xko';
  await view.rerender();
  await controls.rerender();
  expect(labels()).toEqual([]);
  expect(characterSwitch()).toBeNull();
  await controls.unmount();
  await view.unmount();
});
