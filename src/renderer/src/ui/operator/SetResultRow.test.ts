// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { MantineProvider } from '@mantine/core';
import { afterEach, expect, it } from 'vitest';
import type { SetSummary } from '@shared/models';
import { mountView } from '../../hooks/hookTestHarness';
import { initializeI18n, i18n } from '../../i18n';
import { SetResultRow } from './SetResultRow';

afterEach(async () => {
  await act(async () => i18n.changeLanguage('en'));
});

it('shows confirmed DQ and W/L on the correct players and final score, then clears them after a reset', async () => {
  await initializeI18n();
  await i18n.changeLanguage('en');
  let set: SetSummary = {
    id: '42',
    state: '3',
    entrantOne: { id: '1', name: 'Jane' },
    entrantTwo: { id: '2', name: 'John' },
    entrantOneScore: 0,
    entrantTwoScore: 0
  };
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(SetResultRow, {
        set,
        queuePosition: 0,
        disabled: false,
        onOpenSet() {}
      })
    )
  );
  const markers = () => [...view.container.querySelectorAll('.match-card-outcome')].map((node) => node.textContent);
  const finalScore = () => view.container.querySelector('.match-card-final-score')?.textContent;
  for (const kind of ['disqualification', 'win-loss'] as const) {
    for (const winnerId of ['1', '2']) {
      set = { ...set, reportedOutcome: { kind, winnerId } };
      await view.rerender();
      const loser = kind === 'disqualification' ? 'DQ' : 'L';
      const marks = winnerId === '1' ? ['W', loser] : [loser, 'W'];
      expect(markers()).toEqual(marks);
      expect(finalScore()).toBe(`Final Score: ${marks.join(' - ')}`);
      expect(view.container.textContent).toContain('Queued · #1');
    }
  }
  await act(async () => i18n.changeLanguage('es-419'));
  set = { ...set, reportedOutcome: { kind: 'disqualification', winnerId: '2' } };
  await view.rerender();
  expect(view.container.querySelector('[aria-label="Descalificado"]')?.textContent).toBe('DQ');
  expect(finalScore()).toBe('Marcador final: DQ - W');
  set = { ...set, entrantOneScore: undefined, entrantTwoScore: undefined };
  await view.rerender();
  expect(markers()).toEqual(['DQ', 'W']);
  expect(finalScore()).toBe('Marcador final: DQ - W');
  set = { ...set, reportedOutcome: { kind: 'win-loss', winnerId: 'another-player' } };
  await view.rerender();
  expect(markers()).toEqual([]);
  expect(finalScore()).toBeUndefined();
  set = { ...set, state: '1', reportedOutcome: { kind: 'disqualification', winnerId: '2' } };
  await view.rerender();
  expect(markers()).toEqual([]);
  expect(finalScore()).toBeUndefined();
  set = { ...set, state: '3', reportedOutcome: undefined, entrantOneScore: 3, entrantTwoScore: 2 };
  await view.rerender();
  expect(markers()).toEqual(['W', 'L']);
  expect(finalScore()).toBe('Marcador final: 3 - 2');
});
