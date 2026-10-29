// @vitest-environment happy-dom
import { createElement as h, useRef } from 'react';
import { expect, it, vi } from 'vitest';
import { mountView } from '../../hooks/hookTestHarness';
import { useScoreboardContrast } from './useScoreboardContrast';

it('adjusts both sides, refreshes inserted prefixes, and restores colors when overrides are disabled', async () => {
  let palette = '#112233';
  let template = 'dark';
  let sponsor = true;
  let enabled = true;
  let score = 0;
  function Scoreboard() {
    const ref = useRef<HTMLElement>(null);
    useScoreboardContrast(ref, enabled, JSON.stringify([palette, template, sponsor]));
    return h(
      'main',
      { ref },
      ...['left', 'right'].map((side) =>
        h(
          'article',
          {
            key: side,
            className: `overlay-player-${side}`,
            style: { backgroundColor: template === 'dark' ? '#120c09' : '#fff0ce', color: palette }
          },
          sponsor && h('span', { className: 'overlay-player-prefix' }, 'Sponsor'),
          h('span', { className: 'overlay-player-score', style: { backgroundColor: '#101419' } }, score)
        )
      ),
      h(
        'div',
        { className: 'overlay-match-chip', style: { backgroundColor: '#120c09', color: palette } },
        h('strong', {}, 'Final')
      ),
      h(
        'div',
        { className: 'overlay-info-rail', style: { backgroundColor: '#120c09', color: palette } },
        h('span', { className: 'overlay-info-text' }, 'Stream')
      )
    );
  }
  const view = await mountView(() => h(Scoreboard));
  const labels = () => [
    ...view.container.querySelectorAll<HTMLElement>(
      '.overlay-player-prefix, .overlay-player-score, strong, .overlay-info-text'
    )
  ];
  expect(labels()).toHaveLength(6);
  expect(labels().every((label) => label.style.color !== '')).toBe(true);

  // Ordinary score updates must not trigger new style reads or background work.
  const computedStyle = vi.spyOn(window, 'getComputedStyle');
  score++;
  await view.rerender();
  expect(computedStyle).not.toHaveBeenCalled();
  computedStyle.mockRestore();

  palette = '#ffffff';
  await view.rerender();
  expect(labels().every((label) => label.style.color === '')).toBe(true);
  palette = '#112233';
  template = 'light';
  await view.rerender();
  expect(view.container.querySelector<HTMLElement>('.overlay-player-prefix')!.style.color).toBe('');
  expect(view.container.querySelector<HTMLElement>('.overlay-player-score')!.style.color).not.toBe('');
  sponsor = false;
  await view.rerender();
  template = 'dark';
  sponsor = true;
  await view.rerender();
  expect(labels().every((label) => label.style.color !== '')).toBe(true);
  enabled = false;
  await view.rerender();
  expect(labels().every((label) => label.style.color === '')).toBe(true);
});

it('leaves unknown transparent backings and manual custom scoreboard colors alone', async () => {
  function Scoreboard() {
    const ref = useRef<HTMLElement>(null);
    useScoreboardContrast(ref, true, 'dark');
    return h(
      'main',
      { ref },
      h('span', { className: 'overlay-player-prefix', style: { color: '#112233' } }, 'Unknown backing'),
      h(
        'div',
        { style: { backgroundColor: '#112233' } },
        h('span', { className: 'custom-scoreboard-score', style: { color: '#112233' } }, '1')
      )
    );
  }
  const view = await mountView(() => h(Scoreboard));
  for (const label of view.container.querySelectorAll<HTMLElement>('span')) expect(label.style.color).toBe('#112233');
});
