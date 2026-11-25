// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { beforeAll, expect, it } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import { createTestOverlayState } from '@shared/testFixtures';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { ScoreboardDetails } from './ScoreboardDetails';

beforeAll(initializeI18n);

it('lays out the available player details for the game and applies the selected theme', async () => {
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
  // Populate both sides to check mirrored placement.
  set.playerTwo.pronouns = 'they/them';
  await view.rerender();
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
  profile = gameProfiles['street-fighter-6'];
  await view.rerender();
  expect(positions()).toEqual(gamePositions);
  expect(view.container.querySelector('.scoreboard-detail-pill')?.classList.contains(profile.overlay.themeClass)).toBe(
    true
  );
});
