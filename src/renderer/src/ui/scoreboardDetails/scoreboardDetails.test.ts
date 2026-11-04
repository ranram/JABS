// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { beforeAll, expect, it } from 'vitest';
import { gameProfiles, type GameId } from '@shared/gameProfiles';
import { createTestOverlayState } from '@shared/testFixtures';
import { scoreboardPhotoLayout } from '@shared/scoreboardPhotos';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { ScoreboardDetails } from './ScoreboardDetails';
import { scoreboardDetailLayouts, scoreboardDetailsTop } from './scoreboardDetailLayouts';

beforeAll(initializeI18n);

it('keeps both detail groups clear of game HUD and portrait areas at their default positions', () => {
  for (const profile of Object.values(gameProfiles)) {
    const layout = scoreboardDetailLayouts[profile.id];
    const photo = scoreboardPhotoLayout({ gameId: profile.id });
    // Tokon's green assist bars occupy the inner end of the broad photo exclusion strip.
    const hud =
      photo?.protectedAreas.filter((area) => {
        const label = (area as { label?: string }).label ?? '';
        if (profile.id === 'avatar-legends' && label.includes('player label')) return false;
        return profile.id !== 'marvel-tokon' || !label.includes('team state meters');
      }) ?? [];
    // UNI's portrait narrows to x=207 at the pill row, despite its wider top bounds.
    const portraits =
      profile.id === 'under-night-in-birth-ii-sys-celes'
        ? [
            [0, 0, 207, 154],
            [1713, 0, 207, 154]
          ]
        : photo
          ? Object.values(photo.sides).map((side) => side.bounds)
          : [];
    const referenceHud: Partial<Record<GameId, number[][]>> = {
      'street-fighter-6': [[167, 108, 35, 30]],
      'tekken-8': [[74, 151, 340, 53]],
      'avatar-legends': [[526, 105, 354, 24]],
      'marvel-tokon': [[592, 115, 286, 33]],
      'king-of-fighters-xv': [
        [530, 100, 350, 27],
        [170, 102, 113, 27],
        [830, 132, 400, 38]
      ],
      'mortal-kombat-1': [[196, 92, 194, 58]],
      'under-night-in-birth-ii-sys-celes': [[218, 130, 460, 2]],
      'ultimate-marvel-vs-capcom-3': [
        [438, 156, 95, 26],
        [880, 40, 160, 160]
      ]
    };
    const extraHud = (referenceHud[profile.id] ?? []).flatMap(([x, y, width, height]) => [
      [x, y, width, height],
      [1920 - x - width, y, width, height]
    ]);
    const protectedBounds = [...hud.map((area) => area.bounds), ...portraits, ...extraHud];
    const top = scoreboardDetailsTop(profile.id, 0);
    for (const left of [layout.left, 1920 - layout.left - layout.width]) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + layout.width + 4).toBeLessThanOrEqual(1920);
      for (const [x, y, width, height] of protectedBounds) {
        const overlaps = left < x + width && left + layout.width + 4 > x && top < y + height && top + 32 > y;
        expect(overlaps, `${profile.id}: detail group overlaps ${[x, y, width, height]}`).toBe(false);
      }
    }
  }
  expect(scoreboardDetailsTop('guilty-gear-strive', 40)).toBe(206);
});

it('shows populated pills with the X icon first and respects tournament seed visibility without changing player data', async () => {
  const set = createTestOverlayState().selectedSet;
  set.setId = 'linked';
  set.playerOne.xHandle = '@@NAIN_JR';
  set.playerOne.pronouns = 'he/him';
  set.playerOne.seed = 17;
  set.playerTwo.xHandle = undefined;
  set.playerTwo.pronouns = '';
  set.playerTwo.seed = undefined;
  let profile = gameProfiles['street-fighter-6'];
  const view = await mountView(() => h(ScoreboardDetails, { selectedSet: set, profile }));
  expect([...view.container.querySelectorAll('[data-detail]')].map((pill) => pill.getAttribute('data-detail'))).toEqual(
    ['xHandle', 'pronouns', 'seed']
  );
  const handle = view.container.querySelector('[data-detail=xHandle]')!;
  expect(handle.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  expect(handle.textContent).toBe('@NAIN_JR');
  expect(view.container.querySelector('[data-detail=seed]')?.textContent).toBe('Seed 17');
  expect(view.container.querySelectorAll('.scoreboard-detail-group')).toHaveLength(1);
  set.assetCatalogSlug = '2xko';
  set.gameId = '2xko';
  await view.rerender();
  expect(view.container.querySelector<HTMLElement>('.scoreboard-detail-group')?.style.top).toBe(`${150 / 10.8}%`);
  expect(handle.classList.contains('theme-sf6')).toBe(true);
  set.broadcast = { ...set.broadcast!, seedsEnabled: false };
  await view.rerender();
  expect(view.container.querySelector('[data-detail=seed]')).toBeNull();
  set.broadcast.seedsEnabled = true;
  set.setId = undefined;
  await view.rerender();
  expect(view.container.querySelector('[data-detail=seed]')?.textContent).toBe('Seed 17');
  expect(set.playerOne.seed).toBe(17);
  set.playerOne.xHandle = ' ';
  set.playerOne.pronouns = '';
  await view.rerender();
  expect([...view.container.querySelectorAll('[data-detail=seed]')].map((pill) => pill.textContent)).toEqual([
    'Seed 17',
    'Seed 2'
  ]);
  expect(set.playerTwo.seed).toBeUndefined();
  const groups = [...view.container.querySelectorAll<HTMLElement>('.scoreboard-detail-group')];
  expect(groups[0].style.left).toBe(groups[1].style.right);
  expect(groups[0].style.width).toBe(groups[1].style.width);
  set.gameId = 'guilty-gear-strive';
  set.assetCatalogSlug = 'guilty-gear-strive';
  profile = gameProfiles['guilty-gear-strive'];
  await view.rerender();
  const positions = () =>
    [...view.container.querySelectorAll<HTMLElement>('.scoreboard-detail-group')].map((group) => group.style.cssText);
  const gamePositions = positions();
  expect(groups[0].style.top).toBe(`${62 / 10.8}%`);
  for (const style of Object.values(gameProfiles)) {
    profile = style;
    await view.rerender();
    expect(positions(), style.id).toEqual(gamePositions);
    expect(view.container.querySelector('.scoreboard-detail-pill')?.classList.contains(style.overlay.themeClass)).toBe(
      true
    );
  }
});
