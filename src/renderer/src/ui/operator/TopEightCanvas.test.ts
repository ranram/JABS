import { describe, expect, it } from 'vitest';
import { createTopEightDraft } from '@shared/topEight';
import { topEightTrustedText } from './TopEightCanvas';

describe('Top 8 trusted export text', () => {
  it('includes every player while excluding non-visible character selections', () => {
    const draft = createTopEightDraft('street-fighter-6');
    draft.entrants = draft.entrants.map((entrant, index) => ({ ...entrant, name: `Player ${index + 1}`, character: 'Ryu' }));
    const text = topEightTrustedText(draft);
    for (let index = 1; index <= 8; index += 1) expect(text).toContain(`Player ${index}`);
    expect(text).not.toContain('Ryu');
  });

  it('orders each entrant text to match the rendered DOM order', () => {
    const draft = createTopEightDraft('street-fighter-6');
    draft.entrants = [{
      placement: 1,
      name: 'Tweek',
      sponsor: 'TSM',
      xHandle: 'TweekSsb'
    }];
    const text = topEightTrustedText(draft).join('');
    expect(text.indexOf('1st')).toBeLessThan(text.indexOf('TSM'));
    expect(text.indexOf('TSM')).toBeLessThan(text.indexOf('Tweek'));
    expect(text.indexOf('Tweek')).toBeLessThan(text.indexOf('@TweekSsb'));
  });
});
