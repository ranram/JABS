import { describe, expect, it } from 'vitest';
import { prideFlags } from '@shared/prideFlags';
import { countryFlagUrl, displayFlagLabel, displayFlagUrl, overlayPlayerDetails } from './overlayPlayerPresentation';

describe('overlay player presentation', () => {
  it('uses validated country or selected Pride flags without leaking character details', () => {
    expect(countryFlagUrl('US')).toBeTruthy();
    expect(countryFlagUrl('USA')).toBeUndefined();
    expect(displayFlagLabel('US', 'pride:transgender')).toBe('Pride: Transgender');
    expect(displayFlagUrl('US', 'pride:not-in-the-catalog')).toBe(countryFlagUrl('US'));
    expect(prideFlags.every((flag) => displayFlagUrl(undefined, flag.id))).toBe(true);
    expect(overlayPlayerDetails({ entrantId: 'p1', name: 'Player', score: 0, character: 'Sol Badguy', state: 'CA' }, 'Seed 3')).toBe('CA · Seed 3');
  });
});
