import { describe, expect, it } from 'vitest';
import { createTopEightDraft, validateTopEightDraft } from './topEight';

describe('Top 8 model', () => {
  it('accepts a complete Top 8 and rejects duplicate placements', () => {
    const draft = createTopEightDraft();
    expect(validateTopEightDraft(draft)).toBeUndefined();
    draft.entrants[4] = { ...draft.entrants[4], placement: 2 };
    expect(validateTopEightDraft(draft)).toBe('placements');
  });
});
