// @vitest-environment happy-dom
import { photoTransport } from '../scoreboardPhotos/scoreboardPhotoTestHarness';
import { act, createElement as h } from 'react';
import { expect, it } from 'vitest';
import {
  customScoreboardRegion,
  customScoreboardSchema,
  mirrorCustomScoreboardRegion,
  withCustomScoreboardRegion
} from '@shared/customScoreboards';
import { createTestCustomScoreboard, createTestOverlayState } from '@shared/testFixtures';
import { mountView } from '../../hooks/hookTestHarness';
import { invalidateCatalogConsumers } from '../../hooks/useCatalogRevision';
import { CustomScoreboardCanvas } from '../CustomScoreboardCanvas';

const transport = photoTransport();

it('fits sponsor artwork on mirrored nameplates independently of photos and reuses lookups across style and score changes', async () => {
  let scoreboard = createTestCustomScoreboard();
  const selectedSet = createTestOverlayState('2xko').selectedSet;
  selectedSet.playerOne.prefix = 'Team One';
  selectedSet.playerTwo.sponsor = 'Team Two';
  selectedSet.playerOne.name = 'A long player name that remains above the sponsor artwork';
  const view = await mountView(() => h(CustomScoreboardCanvas, { scoreboard, selectedSet, frameUrl: 'frame.png' }));
  const logos = () => [...view.container.querySelectorAll<SVGSVGElement>('.scoreboard-sponsor-logo')];
  expect(transport.resolve).not.toHaveBeenCalled();
  expect(transport.identity).toHaveBeenCalledTimes(1);
  expect(logos()).toHaveLength(2);
  const aspect = (logo: SVGSVGElement) => {
    const [, , width, height] = logo.getAttribute('viewBox')!.split(' ').map(Number);
    return width / height;
  };
  expect(logos().map(aspect)).toEqual([1, 3]);
  expect(logos().map((logo) => logo.getAttribute('preserveAspectRatio'))).toEqual(['xMaxYMid meet', 'xMinYMid meet']);
  expect(
    logos().map((logo) =>
      logo.closest('[data-custom-scoreboard-region]')?.getAttribute('data-custom-scoreboard-region')
    )
  ).toEqual(['playerOneSponsorLogo', 'playerTwoSponsorLogo']);
  expect(view.container.textContent).toContain(selectedSet.playerOne.name);
  const nameRegion = view.container.querySelector<HTMLElement>('[data-custom-scoreboard-region=playerOneName]')!;
  const initialBounds = nameRegion.style.cssText;
  scoreboard.typography.textColor = '#ffbb44';
  selectedSet.playerOne.score = 2;
  await view.rerender();
  expect(transport.identity).toHaveBeenCalledTimes(1);
  expect(transport.sponsor).toHaveBeenCalledTimes(2);
  expect(nameRegion.style.cssText).toBe(initialBounds);
  const originalLogo = customScoreboardRegion(scoreboard, 'playerOneSponsorLogo');
  scoreboard = withCustomScoreboardRegion(scoreboard, 'playerOneSponsorLogo', {
    ...originalLogo,
    x: 420,
    y: 150,
    width: 120,
    height: 80,
    align: 'center'
  });
  scoreboard = mirrorCustomScoreboardRegion(scoreboard, 'playerOneSponsorLogo');
  scoreboard = customScoreboardSchema.parse(JSON.parse(JSON.stringify(scoreboard)));
  await view.rerender();
  const leftLogo = view.container.querySelector<HTMLElement>('[data-custom-scoreboard-region=playerOneSponsorLogo]')!;
  const rightLogo = view.container.querySelector<HTMLElement>('[data-custom-scoreboard-region=playerTwoSponsorLogo]')!;
  expect(leftLogo.style.left).toBe(`${420 / 19.2}%`);
  expect(leftLogo.style.width).toBe(`${120 / 19.2}%`);
  expect(rightLogo.style.left).toBe(`${(1920 - 420 - 120) / 19.2}%`);
  expect(logos().map((logo) => logo.getAttribute('preserveAspectRatio'))).toEqual(['xMidYMid meet', 'xMidYMid meet']);
  expect(nameRegion.style.cssText).toBe(initialBounds);
  expect(transport.identity).toHaveBeenCalledTimes(1);

  expect(view.container.querySelector('[data-custom-scoreboard-region=playerOneScore]')?.textContent).toBe('2');

  scoreboard.visibility.sponsors = false;
  await view.rerender();
  expect(logos()).toHaveLength(0);
  scoreboard.visibility.sponsors = true;
  await view.rerender();
  expect(logos()).toHaveLength(2);
  expect(transport.identity).toHaveBeenCalledTimes(1);

  transport.identity.mockResolvedValue({ matches: [{}, { sponsorLogoAssetId: 'two-tall-logo.png' }] });
  await act(async () => invalidateCatalogConsumers());
  expect(logos()).toHaveLength(1);
  expect(aspect(logos()[0])).toBeCloseTo(2 / 3);
  expect(logos()[0].dataset.playerSide).toBe('right');
  expect(nameRegion.style.cssText).toBe(initialBounds);
  expect(view.container.textContent).toContain(selectedSet.playerOne.name);
  const lookups = transport.identity.mock.calls.length;
  transport.enabled = true;
  transport.sponsorBackdrop = true;
  await view.rerender();
  expect(transport.identity).toHaveBeenCalledTimes(lookups);
  expect(view.container.querySelectorAll('[data-scoreboard-photo-logo]')).toHaveLength(1);
  transport.identity.mockResolvedValue({ matches: [{ sponsorLogoAssetId: 'padded-logo.png' }, {}] });
  await act(async () => invalidateCatalogConsumers());
  const paddedBounds = logos()[0].getAttribute('viewBox')!.split(' ').map(Number);
  expect(paddedBounds[0]).toBeGreaterThan(0);
  expect(paddedBounds[1]).toBeGreaterThan(0);
  expect(paddedBounds[2]).toBeLessThan(1);
  expect(paddedBounds[3]).toBeLessThan(1);
});
