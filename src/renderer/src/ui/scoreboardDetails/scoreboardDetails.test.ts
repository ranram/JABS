// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { beforeAll, expect, it } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import { createTestOverlayState } from '@shared/testFixtures';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { ScoreboardDetails } from './ScoreboardDetails';

beforeAll(initializeI18n);

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
  expect(view.container.querySelector('[data-detail=seed]')).toBeNull();
  expect(set.playerOne.seed).toBe(17);
  expect(set.playerTwo.seed).toBeUndefined();
  // Resume a tournament with both sides populated to check mirrored placement.
  set.setId = 'linked';
  set.playerTwo.pronouns = 'they/them';
  await view.rerender();
  expect([...view.container.querySelectorAll('[data-detail=seed]')].map((pill) => pill.textContent)).toEqual([
    'Seed 17'
  ]);
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
