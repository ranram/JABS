import { describe, expect, it } from 'vitest';
import { createTopEightDraft, hasConventionalTopEightPlacements, topEightMediaBaseScale, validateTopEightDraft } from './topEight';

describe('Top 8 model', () => {
  it('creates a valid conventional eight-entrant draft', () => {
    const draft = createTopEightDraft('tekken-8');
    expect(draft.entrants.map((entrant) => entrant.placement)).toEqual([1, 2, 3, 4, 5, 5, 7, 7]);
    expect(validateTopEightDraft(draft)).toBeUndefined();
    expect(hasConventionalTopEightPlacements(draft.entrants)).toBe(true);
  });

  it('rejects duplicate placements and preserves composition-specific framing', () => {
    const draft = createTopEightDraft();
    draft.entrants[4] = { ...draft.entrants[4], placement: 2 };
    expect(validateTopEightDraft(draft)).toBe('placements');
    expect([topEightMediaBaseScale('editorial', 4), topEightMediaBaseScale('neon', 5), topEightMediaBaseScale('mosaic', 7)]).toEqual([1.65, 1.42, 1.12]);
  });
});
