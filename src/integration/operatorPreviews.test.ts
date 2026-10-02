// @vitest-environment happy-dom
import { act, createElement as h, useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import { createTestOverlayState } from '@shared/testFixtures';
import type { CustomScoreboard } from '@shared/customScoreboards';
import type { StartggGateway } from '@shared/startggGateway';
import { mountView } from '../renderer/src/hooks/hookTestHarness';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { TopEightGenerator } from '../renderer/src/ui/operator/TopEightGenerator';
import { ThumbnailGenerator } from '../renderer/src/ui/operator/ThumbnailGenerator';
import { CustomScoreboardPanel } from '../renderer/src/ui/operator/CustomScoreboardPanel';
import { useTopEightDraft } from '../renderer/src/ui/operator/useTopEightDraft';
import { useThumbnailDraft } from '../renderer/src/ui/operator/useThumbnailDraft';
import { useAssetCatalogReload } from '../renderer/src/ui/operator/useAssetCatalogReload';
import { useOperatorNotifications } from '../renderer/src/ui/operator/useOperatorNotifications';
import { useBracketBrowser } from '../renderer/src/ui/operator/useBracketBrowser';

const transport = vi.hoisted(() => ({
  revision: 1,
  identity: vi.fn(),
  scoreboards: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  notice: vi.fn()
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: transport.notice } }));
vi.mock('../renderer/src/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../renderer/src/api')>();
  return {
    ...original,
    api: {
      ...original.api,
      identityMedia: transport.identity,
      gameCharacterAssets: async () => ({ assets: [] }),
      playerPhotoAssetUrl: async () => `data:image/png;base64,photo${transport.revision}`,
      sponsorLogoAssetUrl: async () => `data:image/png;base64,sponsor${transport.revision}`,
      logoAssetUrl: async () => `data:image/png;base64,logo${transport.revision}`,
      logos: async () => ({ logos: [{ id: 'logo.png', label: 'Logo' }] }),
      assetCatalogSummary: async () => ({ logos: [{ id: 'logo.png', label: 'Logo' }], counts: {} }),
      customScoreboards: transport.scoreboards,
      customScoreboardFrameUrl: async () => 'data:image/png;base64,frame',
      updateCustomScoreboard: transport.save,
      deleteCustomScoreboard: transport.remove
    }
  };
});

const region = { x: 0, y: 0, width: 100, height: 40, align: 'left' as const };
const playerRegions = { flag: region, sponsor: region, name: region, pronouns: region, seed: region, score: region };
const scoreboard: CustomScoreboard = {
  version: 1,
  id: 'test',
  name: 'Test scoreboard',
  frameRevision: '1',
  regions: {
    playerOne: region,
    playerTwo: region,
    matchLabel: region,
    logo: region,
    infoLeft: region,
    infoCenter: region,
    infoRight: region
  },
  playerElements: { playerOne: playerRegions, playerTwo: playerRegions },
  visibility: {
    flags: false,
    sponsors: true,
    xHandles: false,
    pronouns: false,
    seeds: false,
    round: true,
    tournamentLogo: true,
    bottomRails: false
  },
  typography: { textColor: '#ffffff', outline: 'none', nameSize: 20, metaSize: 20, scoreSize: 30, contextSize: 20 }
};
beforeAll(async () => {
  await initializeI18n();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  transport.revision = 1;
});
const profiles = Object.values(gameProfiles);
const logos = [{ id: 'logo.png', label: 'Logo' }];
const activeSet = createTestOverlayState().selectedSet!;
activeSet.broadcast = { ...activeSet.broadcast!, logoEnabled: true, logoAssetId: 'logo.png' };

it('refreshes same-filename media in mounted generator and custom scoreboard previews without repeating identity lookups on style edits', async () => {
  vi.useFakeTimers();
  transport.identity.mockImplementation(async (subjects: unknown[]) => ({
    matches: subjects.map(() => ({ playerPhotoAssetId: 'player.png', sponsorLogoAssetId: 'sponsor.png' }))
  }));
  transport.scoreboards.mockResolvedValue({ scoreboards: [scoreboard] });
  let top!: ReturnType<typeof useTopEightDraft>;
  let thumbnail!: ReturnType<typeof useThumbnailDraft>;
  let reload!: () => Promise<void>;
  function Workspace() {
    top = useTopEightDraft();
    thumbnail = useThumbnailDraft();
    const [revision, setRevision] = useState(0);
    const [, setLogos] = useState(logos);
    reload = useAssetCatalogReload({
      assetCatalogSlug: 'street-fighter-6',
      setLogos,
      setAssetCatalogRevision: setRevision
    }).reloadAssets;
    const common = { profiles, logos, countries: [], moderationRevision: 0, assetCatalogRevision: revision };
    return h(
      MantineProvider,
      { env: 'test' },
      h(TopEightGenerator, { ...common, controller: top }),
      h(ThumbnailGenerator, { ...common, controller: thumbnail }),
      h(CustomScoreboardPanel, { activeSet, onSelect: vi.fn(), onMessage: vi.fn() })
    );
  }
  const view = await mountView(() => h(Workspace));
  await act(async () => {
    top.setMediaMode('photo');
    top.setLogo('logo.png');
    thumbnail.setMediaMode('photo');
    thumbnail.setText({ logoAssetId: 'logo.png' });
    await vi.advanceTimersByTimeAsync(300);
  });
  function assertImages(revision: number) {
    for (const selector of ['.top8-canvas', '.thumbnail-canvas']) {
      const preview = view.container.querySelector(selector);
      expect(preview, selector).not.toBeNull();
      for (const kind of ['photo', 'sponsor', 'logo']) {
        expect(
          preview!.querySelector(`img[src="data:image/png;base64,${kind}${revision}"]`),
          `${selector}: ${kind}`
        ).not.toBeNull();
      }
    }
    expect(
      view.container.querySelector(`.custom-scoreboard-preview-shell img[src="data:image/png;base64,logo${revision}"]`)
    ).not.toBeNull();
  }
  assertImages(1);
  const initialLookups = transport.identity.mock.calls.length;
  await act(async () => {
    top.setStyle('mosaic');
    thumbnail.setStyle('spotlight');
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(transport.identity).toHaveBeenCalledTimes(initialLookups);
  transport.revision = 2;
  await act(async () => reload());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  assertImages(2);
  expect(transport.identity).toHaveBeenCalledTimes(initialLookups + 2);
  await view.unmount();
}, 20_000);

it('shows custom scoreboard and bracket failures as persistent errors in English and Spanish', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  transport.save.mockRejectedValue(null);
  transport.remove.mockRejectedValue(null);
  const events = vi.fn().mockRejectedValue(null);
  let browser!: ReturnType<typeof useBracketBrowser>;
  function Workspace() {
    const onMessage = useOperatorNotifications();
    browser = useBracketBrowser({
      startgg: { events } as unknown as StartggGateway,
      setMessage: onMessage,
      setLoading: vi.fn(),
      setTokenVerified: vi.fn()
    });
    return h(MantineProvider, { env: 'test' }, h(CustomScoreboardPanel, { onMessage, onSelect: vi.fn() }));
  }
  for (const language of ['en', 'es-419']) {
    await act(async () => {
      await i18n.changeLanguage(language);
    });
    const assertFailure = (
      key:
        | 'customScoreboard.loadFailed'
        | 'customScoreboard.saveFailed'
        | 'customScoreboard.deleteFailed'
        | 'messages.loadEventsFailed'
    ) =>
      expect(transport.notice).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: i18n.t('operator:notices.actionFailed'),
          message: i18n.t(`operator:${key}`),
          color: 'red',
          autoClose: false
        })
      );
    transport.scoreboards.mockRejectedValueOnce(null);
    let view = await mountView(() => h(Workspace));
    assertFailure('customScoreboard.loadFailed');
    await view.unmount();
    transport.scoreboards.mockResolvedValue({ scoreboards: [scoreboard] });
    view = await mountView(() => h(Workspace));
    for (const action of ['save', 'delete'] as const) {
      const button = [...view.container.querySelectorAll('button')].find(
        (button) => button.textContent === i18n.t(`operator:customScoreboard.${action}`)
      );
      expect(button).toBeDefined();
      await act(async () => button!.click());
      assertFailure(`customScoreboard.${action}Failed`);
    }
    await act(async () => browser.loadEvents('autumn-finals'));
    assertFailure('messages.loadEventsFailed');
    await view.unmount();
  }
});
