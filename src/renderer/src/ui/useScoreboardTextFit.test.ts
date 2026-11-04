// @vitest-environment happy-dom
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mountView } from '../hooks/hookTestHarness';
import { useScoreboardTextFit } from './useScoreboardTextFit';
import { ScoreboardPlayerName } from './ScoreboardPlayerName';

afterEach(() => vi.restoreAllMocks());

it('stacks long sponsored identities before shrinking and restores short identities', async () => {
  let name = 'A VERY LONG PLAYER NAME';
  let sponsor = 'TEAM';
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 32 } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return name.length > 10 ? (this.dataset.stacked ? 280 : 380) : 150;
  });
  function Identity() {
    const ref = useScoreboardTextFit({ name, sponsor, themeId: 'street-fighter-6' });
    return h(
      'div',
      { ref },
      h(
        'span',
        { className: 'overlay-player-identity' },
        h('strong', { className: 'overlay-player-name' }, h(ScoreboardPlayerName, { name, sponsor, side: 'right' }))
      )
    );
  }
  const view = await mountView(() => h(Identity));
  const text = view.container.querySelector<HTMLElement>('.overlay-player-name')!;
  expect(text.dataset.stacked).toBe('true');
  expect(text.style.fontSize).toBe('');
  expect(text.textContent).toContain(name);
  name = 'PLAYER';
  await view.rerender();
  expect(text.dataset.stacked).toBeUndefined();
  expect(text.style.fontSize).toBe('');
  sponsor = '';
  await view.rerender();
  expect(text.querySelector('.scoreboard-name-separator')).toBeNull();
});
