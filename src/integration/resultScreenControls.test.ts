// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { gameProfiles } from '@shared/gameProfiles';
import { createTestOverlayState } from '@shared/testFixtures';
import type { OverlayMediaMatches, OverlayState } from '@shared/models';
import { resultScreenStateSchema, type ResultScreenState } from '@shared/resultScreen';
import { deferred, mountView } from '../renderer/src/hooks/hookTestHarness';
import { invalidateCatalogConsumers } from '../renderer/src/hooks/useCatalogRevision';
import { initializeI18n, i18n } from '../renderer/src/i18n';
import { ResultScreenControls } from '../renderer/src/ui/operator/ResultScreenControls';

const transport = vi.hoisted(() => ({
  state: undefined as OverlayState | undefined,
  result: undefined as ResultScreenState | undefined,
  saveResult: vi.fn(),
  playerMedia: vi.fn(),
  characters: vi.fn()
}));
const logos = [
  { id: 'exhibition.png', label: 'Exhibition' },
  { id: 'local.png', label: 'Local overlay' }
];
vi.mock('../renderer/src/api', () => ({
  api: {
    playerMedia: transport.playerMedia,
    identityMedia: async () => {
      const matches = await transport.playerMedia();
      return { matches: [matches.playerOne, matches.playerTwo] };
    },
    gameCharacterAssets: transport.characters,
    gameCharacterAssetUrl: async (_slug: string, id: string) => `data:image/png;base64,${id}`,
    playerPhotoAssetUrl: async (id: string) => `data:image/png;base64,${id}`,
    sponsorLogoAssetUrl: async (id: string) => `data:image/png;base64,${id}`,
    logos: async () => ({ logos }),
    logoAssetUrl: async (id: string) => `data:image/png;base64,${id}`,
    resultScreenState: async () => transport.result,
    updateResultScreenState: transport.saveResult
  }
}));
afterEach(() => vi.restoreAllMocks());

it('configures result logos and refreshes the current winner media without accepting stale replies', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  const fresh = createTestOverlayState();
  const exhibition = {
    ...fresh.selectedSet,
    assetCatalogSlug: 'samurai-shodown',
    matchFormat: 'first-to' as const,
    bestOf: 13,
    playerOne: { ...fresh.selectedSet.playerOne, name: 'Alpha', character: 'Haohmaru' },
    playerTwo: { ...fresh.selectedSet.playerTwo, name: 'Beta', character: 'Nakoruru' }
  };
  const loaded = { ...exhibition, setId: 'set', eventId: 'event' };
  transport.result = resultScreenStateSchema.parse({
    stylingGameId: 'street-fighter-6',
    showTournamentLogo: true,
    showPlayerPhoto: false,
    showSponsorLogo: false,
    showCharacter: false,
    updatedAt: fresh.selectedSet.updatedAt
  });
  transport.saveResult.mockImplementation(async (next: ResultScreenState) => {
    transport.result = next;
    return next;
  });
  transport.state = { selectedSet: loaded };
  const resultView = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(ResultScreenControls, {
        activeSet: transport.state?.selectedSet,
        profiles: Object.values(gameProfiles),
        logos
      })
    )
  );
  const clearStyle = resultView.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Use live match style"]'
  )!;
  expect(clearStyle).not.toBeNull();
  await act(async () => clearStyle.click());
  expect(transport.saveResult).toHaveBeenLastCalledWith(expect.objectContaining({ stylingGameId: undefined }));
  const resultLogoInput = () => {
    const label = [...resultView.container.querySelectorAll('label')].find((label) => label.textContent === 'Logo')!;
    return document.getElementById(label.htmlFor) as HTMLInputElement;
  };
  expect(resultLogoInput().placeholder).toBe('Use rails logo');
  await act(async () => resultLogoInput().click());
  const resultLogo = [...document.querySelectorAll('[role="option"]')].find(
    (option) => option.textContent === 'Local overlay'
  )!;
  await act(async () => (resultLogo as HTMLElement).click());
  expect(transport.saveResult).toHaveBeenLastCalledWith(expect.objectContaining({ logoAssetId: 'local.png' }));
  transport.state.selectedSet.broadcast = { ...loaded.broadcast!, logoAssetId: 'exhibition.png' };
  await resultView.rerender();
  expect(resultLogoInput().value).toBe('Local overlay');
  await act(async () => (resultView.container.querySelector('[aria-label="Use rails logo"]') as HTMLElement).click());
  expect(transport.result!.logoAssetId).toBeUndefined();
  expect(resultLogoInput().placeholder).toBe('Use rails logo');

  expect(transport.playerMedia).not.toHaveBeenCalled();
  expect(transport.characters).not.toHaveBeenCalled();
  // Manual Player 2 winners have no entrant IDs. Reload must check their own new files.
  const playerTwoWinner = {
    ...exhibition,
    playerOne: { ...exhibition.playerOne, entrantId: '', score: 0 },
    playerTwo: { ...exhibition.playerTwo, entrantId: '', score: 7 }
  };
  transport.playerMedia.mockResolvedValue({ playerOne: { playerPhotoAssetId: 'alpha.png' }, playerTwo: {} });
  transport.characters.mockResolvedValue({ assets: [] });
  transport.state = { selectedSet: playerTwoWinner };
  await resultView.rerender();
  function expectAvailability(setting: 'showPlayerPhoto' | 'showSponsorLogo' | 'showCharacter', available: boolean) {
    const label = [...resultView.container.querySelectorAll('label')].find((label) =>
      label.textContent?.startsWith(i18n.t(`operator:workspaces.resultScreen.${setting}`))
    )!;
    const input = document.getElementById(label.htmlFor)!;
    const descriptionId = input.getAttribute('aria-describedby');
    if (available) {
      expect(descriptionId).toBeNull();
    } else {
      expect(document.getElementById(descriptionId!)?.textContent).toBe(
        i18n.t('operator:workspaces.resultScreen.unavailableForWinner')
      );
    }
  }
  expectAvailability('showPlayerPhoto', false);
  expectAvailability('showSponsorLogo', false);
  expectAvailability('showCharacter', false);
  transport.playerMedia.mockResolvedValue({
    playerOne: {},
    playerTwo: { playerPhotoAssetId: 'beta.png', sponsorLogoAssetId: 'beta-team.png' }
  });
  transport.characters.mockResolvedValue({
    assets: [{ character: 'Nakoruru', assetId: 'Nakoruru.png', variants: [] }]
  });
  await act(async () => invalidateCatalogConsumers());
  expectAvailability('showPlayerPhoto', true);
  expectAvailability('showSponsorLogo', true);
  expectAvailability('showCharacter', true);
  const resultMediaReads = transport.playerMedia.mock.calls.length;
  const resultCatalogReads = transport.characters.mock.calls.length;
  transport.state.selectedSet = {
    ...playerTwoWinner,
    playerTwo: { ...playerTwoWinner.playerTwo, score: 8 },
    broadcast: { ...playerTwoWinner.broadcast!, logoAssetId: 'local.png' }
  };
  await resultView.rerender();
  expectAvailability('showPlayerPhoto', true);
  expect(transport.playerMedia).toHaveBeenCalledTimes(resultMediaReads);
  expect(transport.characters).toHaveBeenCalledTimes(resultCatalogReads);
  transport.playerMedia.mockResolvedValue({ playerOne: {}, playerTwo: {} });
  transport.characters.mockResolvedValue({ assets: [] });
  await act(async () => invalidateCatalogConsumers());
  expectAvailability('showPlayerPhoto', false);
  expectAvailability('showSponsorLogo', false);
  expectAvailability('showCharacter', false);

  const lateMedia = deferred<OverlayMediaMatches>();
  transport.playerMedia.mockReturnValueOnce(lateMedia.promise);
  await act(async () => invalidateCatalogConsumers());
  transport.state.selectedSet = { ...playerTwoWinner, playerTwo: { ...playerTwoWinner.playerTwo, name: 'Gamma' } };
  await resultView.rerender();
  await act(async () => lateMedia.resolve({ playerOne: {}, playerTwo: { playerPhotoAssetId: 'beta.png' } }));
  expectAvailability('showPlayerPhoto', false);
  const layoutLabel = [...resultView.container.querySelectorAll('label')].find(
    (label) => label.textContent === 'Layout'
  )!;
  await act(async () => document.getElementById(layoutLabel.htmlFor)!.click());
  const highlight = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (option) => option.textContent === 'Highlight'
  )!;
  await act(async () => highlight.click());
  expect(transport.result!.composition).toBe('highlight');
  for (const [labelText, key, value] of [
    ['Show confetti', 'showConfetti', true],
    ['Show player name', 'showIdentity', false],
    ['Show Winner / Champion title', 'showWinnerTitle', false],
    ['Transparent background', 'showBackground', false]
  ] as const) {
    const label = [...resultView.container.querySelectorAll('label')].find((label) => label.textContent === labelText)!;
    await act(async () => document.getElementById(label.htmlFor)!.click());
    expect(transport.saveResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ composition: 'highlight', [key]: value })
    );
  }
  for (const layout of ['Highlight', 'Classic', 'Victory', 'Spotlight']) {
    if (layout !== 'Highlight') {
      await act(async () => document.getElementById(layoutLabel.htmlFor)!.click());
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (option) => option.textContent === layout
      )!;
      await act(async () => option.click());
    }
    expect(resultView.container.querySelector('.artwork-framing-shell.is-transparent-preview')).not.toBeNull();
    expect(resultView.container.querySelector('.artwork-preview-subject.is-transparent-background')).not.toBeNull();
    const label = [...resultView.container.querySelectorAll('label')].find(
      (label) => label.textContent === 'Transparent background'
    )!;
    await act(async () => document.getElementById(label.htmlFor)!.click());
    expect(transport.result!.showBackground).toBe(true);
    expect(resultView.container.querySelector('.is-transparent-preview')).toBeNull();
    expect(resultView.container.querySelector('.artwork-preview-subject.is-transparent-background')).toBeNull();
    await act(async () => document.getElementById(label.htmlFor)!.click());
  }
  await resultView.unmount();
});
