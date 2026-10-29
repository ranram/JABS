// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { Accordion, MantineProvider } from '@mantine/core';
import { afterEach, expect, it, vi } from 'vitest';
import type { CommentatorState } from '@shared/commentators';
import { gameProfiles } from '@shared/gameProfiles';
import { deferred, mountView } from '../../hooks/hookTestHarness';
import { i18n, initializeI18n } from '../../i18n';
import { CommentatorPanel } from './CommentatorPanel';

const transport = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), notice: vi.fn() }));
vi.mock('../../api', () => ({
  api: { commentatorState: transport.load, updateCommentatorState: transport.save }
}));
vi.mock('@mantine/notifications', () => ({ notifications: { show: transport.notice } }));

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  vi.clearAllMocks();
});

it('swaps the current draft from the header without toggling the accordion or discarding failed edits', async () => {
  await initializeI18n();
  const initial: CommentatorState = {
    stylingGameId: 'street-fighter-6',
    tournamentName: 'Finals',
    commentators: [
      { name: 'One', handle: '@one' },
      { name: 'Two', handle: '@two' }
    ],
    presentation: 'hidden',
    updatedAt: '2026-10-26T00:00:00Z'
  };
  const loading = deferred<CommentatorState>();
  const saving = deferred<CommentatorState>();
  transport.load.mockReturnValue(loading.promise);
  transport.save.mockReturnValueOnce(saving.promise).mockImplementation(async (state: CommentatorState) => state);
  const view = await mountView(() =>
    h(
      MantineProvider,
      { env: 'test' },
      h(
        Accordion,
        { defaultValue: 'commentators', transitionDuration: 0 },
        h(CommentatorPanel, { logos: [], profiles: Object.values(gameProfiles) })
      )
    )
  );
  const toggle = view.container.querySelector<HTMLButtonElement>('[aria-expanded]')!;
  const swap = view.container.querySelector<HTMLButtonElement>('.commentator-swap-button')!;
  expect(swap.disabled).toBe(true);
  expect(toggle.contains(swap)).toBe(false);
  await act(async () => loading.resolve(initial));
  const tournament = view.container.querySelector<HTMLInputElement>('.commentator-tournament-field input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(tournament, 'Updated finals');
    tournament.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await i18n.changeLanguage('es-419');
  });
  expect(transport.load).toHaveBeenCalledTimes(1);
  expect(tournament.value).toBe('Updated finals');
  await act(async () => swap.click());
  const submitted = transport.save.mock.calls[0][0] as CommentatorState;
  expect(submitted).toMatchObject({
    tournamentName: 'Updated finals',
    commentators: [initial.commentators[1], initial.commentators[0]],
    presentation: 'hidden'
  });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(swap.disabled).toBe(true);
  await act(async () => toggle.querySelector<HTMLElement>('.mantine-Accordion-chevron')!.click());
  await act(async () => saving.resolve(submitted));
  await act(async () => swap.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(transport.save).toHaveBeenLastCalledWith({ ...initial, tournamentName: 'Updated finals' });
  transport.save.mockRejectedValueOnce(new Error('Could not save commentators.'));
  await act(async () => swap.click());
  expect(transport.notice).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }));
  await act(async () => toggle.click());
  const names = [...view.container.querySelectorAll<HTMLInputElement>('.commentator-controls input')].map(
    (input) => input.value
  );
  expect(names).toContain('Updated finals');
  expect(names.indexOf('One')).toBeLessThan(names.indexOf('Two'));
});
