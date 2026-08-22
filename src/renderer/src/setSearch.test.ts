import { describe, expect, it } from 'vitest';
import type { SetSummary } from '@shared/models';
import { filterLoadedSets } from './setSearch';

const sets: SetSummary[] = [
  { id: 'set-1', phase: 'Top 24', phaseGroup: 'A1', round: 'Winners Final', station: 'Main Stage', entrantOne: { id: 'a', name: 'Álpha' }, entrantTwo: { id: 'b', name: 'Bravo' } },
  { id: 'set-2', round: 'Losers Semifinal', station: 'Station 4', entrantOne: { id: 'c', name: 'Charlie' }, entrantTwo: { id: 'd', name: 'Delta' } }
];

describe('loaded set search', () => {
  it('searches all useful fields without case or accent sensitivity', () => {
    expect(filterLoadedSets(sets, 'alpha winners')).toEqual([sets[0]]);
    expect(filterLoadedSets(sets, 'STATION 4')).toEqual([sets[1]]);
    expect(filterLoadedSets(sets, 'set-2')).toEqual([sets[1]]);
    expect(filterLoadedSets(sets, '  ')).toBe(sets);
    expect(filterLoadedSets(sets, 'echo')).toEqual([]);
  });
});
