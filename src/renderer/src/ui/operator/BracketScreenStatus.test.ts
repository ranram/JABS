// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { expect, it } from 'vitest';
import { bracketScreenStateSchema } from '@shared/bracketScreen';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n } from '../../i18n';
import { BracketScreenStatus } from './BracketScreenStatus';

it('shows the viewed phase and pool without carrying names over from another selection', async () => {
  await initializeI18n();
  const scope = { eventId: '10', phaseId: '20', phaseGroupId: '30' };
  const state = bracketScreenStateSchema.parse({
    settings: { stylingGameId: 'street-fighter-6', scope, updatedAt: '2026-11-17T00:00:00Z' },
    snapshot: {
      scope,
      tournamentName: 'Weekly',
      eventName: 'Singles',
      phaseName: 'Top 32',
      groupName: 'A1',
      groupCount: 4,
      completed: false,
      matches: [],
      fetchedAt: '2026-11-17T00:00:00Z'
    }
  });
  let eventId: string | undefined = '10';
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(BracketScreenStatus, { state, eventId, phases: [{ id: '20', name: 'Top 32' }] })
    )
  );
  const caption = () => view.container.querySelector('[title]')?.textContent ?? '';
  expect(caption()).toBe('Top 32 · Pool A1');
  state.settings.scope = { ...scope, phaseGroupId: '31' };
  await view.rerender();
  expect(caption()).toBe('Top 32');
  state.snapshot!.scope = state.settings.scope;
  state.snapshot!.groupName = 'B1';
  await view.rerender();
  expect(caption()).toBe('Top 32 · Pool B1');
  state.snapshot!.groupCount = 1;
  await view.rerender();
  expect(caption()).toBe('Top 32 · Pool B1');
  expect(view.container.querySelector('.mantine-Badge-root')).not.toBeNull();
  eventId = '11';
  await view.rerender();
  expect(caption()).toBe('No phase/pool selected');
  eventId = undefined;
  await view.rerender();
  expect(caption()).toBe('No phase/pool selected');
  state.settings.scope = undefined;
  eventId = '10';
  await view.rerender();
  expect(caption()).toBe('No phase/pool selected');
});
