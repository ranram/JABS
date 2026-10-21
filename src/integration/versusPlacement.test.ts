// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { gameProfiles } from '@shared/gameProfiles';
import { defaultMediaTransform, type MediaTransform } from '@shared/mediaPlacement';
import { versusScreenStateSchema, type VersusScreenState } from '@shared/versusScreen';
import { deferred, mountView } from '../renderer/src/hooks/hookTestHarness';
import { initializeI18n } from '../renderer/src/i18n';
import { VersusScreenControls } from '../renderer/src/ui/operator/VersusScreenControls';

const transport = vi.hoisted(() => ({
  settings: undefined as VersusScreenState | undefined,
  save: vi.fn(),
  preview: undefined as
    | {
        onPlacementChange(player: 0 | 1, layer: 'character' | 'photo', value: MediaTransform): void;
        settings: VersusScreenState;
      }
    | undefined
}));
vi.mock('../renderer/src/api', () => ({
  api: { versusScreenState: async () => transport.settings, updateVersusScreenState: transport.save }
}));
vi.mock('../renderer/src/hooks/useVersusScreenState', () => ({
  useVersusScreenState: () => ({ state: transport.settings })
}));
vi.mock('../renderer/src/ui/operator/VersusPreview', () => ({
  VersusPreview: (props: NonNullable<typeof transport.preview>) => {
    transport.preview = props;
    return null;
  }
}));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('does not reapply an old game’s queued placement after a failed save reloads the new match', async () => {
  await initializeI18n();
  vi.useFakeTimers();
  let activeSet = createTestOverlayState('street-fighter-6').selectedSet;
  activeSet.setId = undefined;
  activeSet.eventId = undefined;
  activeSet.assetCatalogSlug = 'vampire-savior-the-lord-of-vampire';
  activeSet.videogameId = '582';
  transport.settings = versusScreenStateSchema.parse({
    stylingGameId: 'street-fighter-6',
    mediaMode: 'combined',
    showTournamentLogo: false,
    showSponsorLogos: false,
    updatedAt: activeSet.updatedAt
  });
  const firstSave = deferred<VersusScreenState>();
  transport.save.mockImplementationOnce(() => firstSave.promise);
  const view = await mountView(() =>
    h(
      MantineProvider,
      null,
      h(VersusScreenControls, { activeSet, profiles: [gameProfiles['street-fighter-6']], logos: [] })
    )
  );
  await act(async () =>
    transport.preview!.onPlacementChange(0, 'character', { ...defaultMediaTransform(), scale: 1.4 })
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(transport.save).toHaveBeenCalledOnce();
  await act(async () => transport.preview!.onPlacementChange(0, 'character', { ...defaultMediaTransform(), scale: 2 }));

  activeSet = {
    ...activeSet,
    setId: 'new-match',
    eventId: 'event',
    assetCatalogSlug: 'street-fighter-6',
    videogameId: '43868'
  };
  transport.settings = versusScreenStateSchema.parse({
    ...transport.settings,
    mediaPlacements: undefined,
    updatedAt: '2026-10-21T12:00:00Z'
  });
  transport.save.mockResolvedValue(transport.settings);
  await view.rerender();
  await act(async () => {
    firstSave.reject(new Error('Settings changed.'));
  });
  expect(transport.save).toHaveBeenCalledTimes(2);
  expect(transport.save.mock.calls[1][0].mediaPlacements[0].character).toEqual(defaultMediaTransform());
  expect(transport.preview!.settings.mediaPlacements[0].character).toEqual(defaultMediaTransform());
});
