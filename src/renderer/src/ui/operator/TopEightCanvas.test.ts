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
});
