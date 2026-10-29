// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import type { StartggGateway } from '@shared/startggGateway';
import { startggReportReadiness } from '@shared/startggReporting';
import { mountHook, mountView } from '../../hooks/hookTestHarness';
import { usePendingWrites } from '../../pendingWrites';
import { initializeI18n, i18n } from '../../i18n';
import { LiveControlsPanel } from './LiveControlsPanel';
import { DashboardSetActions } from './DashboardSetActions';
import { useQuickScoreActions } from './useQuickScoreActions';
import { localizedReadinessReason } from './operatorUtils';

afterEach(async () => {
  await act(async () => i18n.changeLanguage('en'));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function selectedSet() {
  const set = createTestOverlayState().selectedSet;
  Object.assign(set, { setId: '100', eventId: '456', state: '1', gameHistory: undefined });
  set.playerOne.score = 1;
  set.playerTwo.score = 0;
  return set;
}
const noop = () => {};
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

it('toggles either winner or DQ in Live Controls without changing scores and clears choices on reset or a new set', async () => {
  await initializeI18n();
  const set = selectedSet();
  const original = structuredClone(set);
  const report = vi.fn();
  const pending = await mountHook(usePendingWrites);
  expect(pending.current).toBe(false);
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(LiveControlsPanel, {
        selectedSet: set,
        reportReadiness: startggReportReadiness(set),
        reportReadinessReason: localizedReadinessReason(startggReportReadiness(set)),
        reportingEnabled: true,
        shortcutsEnabled: false,
        loading: false,
        draftDirty: false,
        onScore: noop,
        onReset: noop,
        onSwap: noop,
        onReport: report,
        onCopy: noop
      })
    )
  );
  const submit = () => view.container.querySelector<HTMLButtonElement>('[data-testid="report-startgg-result"]')!;
  expect(submit().disabled).toBe(true);
  await act(async () => button(`Mark ${set.playerOne.name} as winner`).click());
  expect(pending.current).toBe(true);
  expect(submit().disabled).toBe(false);
  await act(async () => button(`Mark ${set.playerTwo.name} as winner`).click());
  expect(button(`Mark ${set.playerOne.name} as winner`).getAttribute('aria-pressed')).toBe('false');
  await act(async () => button(`Disqualify ${set.playerOne.name}`).click());
  await act(async () => i18n.changeLanguage('es-419'));
  await act(async () => submit().click());
  expect(report).toHaveBeenLastCalledWith({ kind: 'disqualification', winnerId: set.playerTwo.entrantId });
  expect(set).toEqual(original);
  await act(async () => button(`Descalificar a ${set.playerOne.name}`).click());
  expect(submit().disabled).toBe(true);
  expect(pending.current).toBe(false);
  await act(async () => button(`Marcar a ${set.playerOne.name} como ganador`).click());
  await act(async () =>
    [...view.container.querySelectorAll<HTMLButtonElement>('button')]
      .find((node) => node.textContent === i18n.t('common:actions.resetScores'))!
      .click()
  );
  expect(submit().disabled).toBe(true);
  await act(async () => button(`Marcar a ${set.playerOne.name} como ganador`).click());
  set.setId = '200';
  await view.rerender();
  expect(submit().disabled).toBe(true);
  expect(pending.current).toBe(false);
});

it.each(['win-loss', 'disqualification'] as const)(
  'confirms and submits %s through Quick Score with the upstream snapshot intact',
  async (kind) => {
    await initializeI18n();
    const set = selectedSet();
    const inspect = vi.fn(async () => ({ selectedSet: set, source: 'live' }));
    const report = vi.fn(async () => ({
      reportedSetId: '100',
      reportedSetState: '3',
      reportedGameCount: 0,
      reportedCharacterSelectionCount: 0
    }));
    const gateway = { inspectStartggSet: inspect, quickReportStartggSet: report } as unknown as StartggGateway;
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);
    let actions!: ReturnType<typeof useQuickScoreActions>;
    function Fixture() {
      actions = useQuickScoreActions({
        startgg: gateway,
        setLoadGameId: set.gameId,
        selectedEventId: '456',
        tournamentSlug: 'test',
        setMessage: noop,
        setTokenVerified: noop,
        refreshAfterReport: async () => true,
        readinessReason: localizedReadinessReason
      });
      return h(DashboardSetActions, {
        quickScore: actions,
        reportingEnabled: true,
        loading: false,
        characterOptions: [],
        onSendToStream: noop
      });
    }
    await mountView(() => h(MantineProvider, { env: 'test' }, h(Fixture)));
    const target = {
      id: '100',
      state: '1',
      entrantOne: { id: set.playerOne.entrantId, name: set.playerOne.name },
      entrantTwo: { id: set.playerTwo.entrantId, name: set.playerTwo.name }
    };
    await act(async () => actions.open(target));
    await act(async () => actions.begin(target));
    await act(async () =>
      button(
        kind === 'disqualification' ? `Disqualify ${set.playerOne.name}` : `Mark ${set.playerTwo.name} as winner`
      ).click()
    );
    const submit = () => document.querySelector<HTMLButtonElement>('[data-testid="quick-report-startgg-result"]')!;
    await act(async () => submit().click());
    expect(report).not.toHaveBeenCalled();
    await act(async () => submit().click());
    expect(report).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        outcome: { kind, winnerId: set.playerTwo.entrantId },
        confirmed: true,
        playerOneScore: 1,
        playerTwoScore: 0,
        gameHistory: undefined,
        expected: {
          state: '1',
          playerOneEntrantId: set.playerOne.entrantId,
          playerTwoEntrantId: set.playerTwo.entrantId,
          playerOneScore: 1,
          playerTwoScore: 0
        }
      })
    );
    expect(confirm).toHaveBeenLastCalledWith(
      expect.stringContaining('Game scores and character selections will not be sent.')
    );
    expect(set.playerOne.score).toBe(1);
    expect(set.playerTwo.score).toBe(0);
  }
);
