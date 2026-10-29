// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestOverlayState } from '@shared/testFixtures';
import { startggReportReadiness } from '@shared/startggReporting';
import type { OverlayState } from '@shared/models';
import type { OperatorDraftState } from '../../operatorDraft';
import { mountView } from '../../hooks/hookTestHarness';
import { useOverlayState } from '../../hooks/useOverlayState';
import { initializeI18n, i18n } from '../../i18n';
import { useOperatorDraft } from './useOperatorDraft';
import { LiveControlsPanel } from './LiveControlsPanel';
import { localizedReadinessReason } from './operatorUtils';

const transport = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../../api', () => ({
  api: { state: transport.load },
  websocketUrl: async () => 'ws://127.0.0.1/test',
  acceptCatalogMessage: () => false
}));
afterEach(() => {
  vi.unstubAllGlobals();
  transport.load.mockReset();
});

it.each(['en', 'es-419'])(
  'refreshes reported status and report readiness without losing draft edits in %s',
  async (locale) => {
    await initializeI18n();
    await i18n.changeLanguage(locale);
    const sockets: EventTarget[] = [];
    vi.stubGlobal(
      'WebSocket',
      class extends EventTarget {
        constructor() {
          super();
          sockets.push(this);
        }
        close() {}
      }
    );
    const original = createTestOverlayState();
    Object.assign(original.selectedSet, {
      setId: '100',
      eventId: '456',
      state: '3',
      bestOf: 5,
      gameHistory: undefined
    });
    original.selectedSet.playerOne.score = 1;
    original.selectedSet.playerTwo.score = 3;
    transport.load.mockResolvedValue(original);
    let observedDraft: OperatorDraftState | undefined;
    let editDraft!: () => void;
    const noop = () => {};
    function Fixture() {
      const { state } = useOverlayState();
      const [draft, setDraft] = useOperatorDraft(state?.selectedSet);
      observedDraft = draft;
      editDraft = () =>
        setDraft(
          (current) =>
            current && {
              ...current,
              dirty: true,
              value: { ...current.value, displayName: 'Keep this edit', state: '3' }
            }
        );
      if (!state) return null;
      return h(LiveControlsPanel, {
        selectedSet: state.selectedSet,
        reportReadiness: startggReportReadiness(state.selectedSet),
        reportingEnabled: true,
        shortcutsEnabled: false,
        reportReadinessReason: localizedReadinessReason(startggReportReadiness(state.selectedSet)),
        loading: false,
        draftDirty: draft?.dirty ?? false,
        onScore: noop,
        onReset: noop,
        onSwap: noop,
        onReport: noop,
        onCopy: noop
      });
    }
    const view = await mountView(() => h(MantineProvider, { env: 'test' }, h(Fixture)));
    const result = () => view.container.querySelector('[role="status"]')?.textContent;
    const report = () => view.container.querySelector<HTMLButtonElement>('[data-testid="report-startgg-result"]')!;
    const publish = async (state: OverlayState) =>
      act(async () => {
        sockets[0].dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify({ event: 'overlay-state', payload: state })
          })
        );
      });
    try {
      expect(result()).toBe(i18n.t('operator:ux.result.reported'));
      expect(report().disabled).toBe(true);
      const reset = structuredClone(original);
      reset.selectedSet.state = '1';
      reset.selectedSet.upstreamReset = true;
      reset.selectedSet.updatedAt = '2026-10-27T06:00:00Z';
      await publish(reset);
      expect(result()).toBe(i18n.t('operator:readiness.upstreamReset'));
      expect(report().disabled).toBe(true);
      expect(observedDraft?.value.playerOne.score).toBe(1);
      expect(observedDraft?.value.playerTwo.score).toBe(3);

      const scored = structuredClone(reset);
      scored.selectedSet.upstreamReset = false;
      scored.selectedSet.updatedAt = '2026-10-27T06:00:00.500Z';
      await publish(scored);
      expect(result()).toBe(i18n.t('operator:ux.result.ready'));
      expect(report().disabled).toBe(false);
      await act(async () => editDraft());
      const active = structuredClone(scored);
      active.selectedSet.state = '2';
      active.selectedSet.updatedAt = '2026-10-27T06:00:01Z';
      await publish(active);
      expect(observedDraft?.value.displayName).toBe('Keep this edit');
      expect(observedDraft?.value.state).toBe('2');
      expect(observedDraft?.dirty).toBe(true);
      expect(result()).toBe(i18n.t('operator:ux.result.pending'));
      expect(report().disabled).toBe(true);
    } finally {
      await view.unmount();
      await i18n.changeLanguage('en');
    }
  }
);
