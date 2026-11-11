import { expect, it } from 'vitest';
import { createTestTopEightSets } from './testFixtures';
import { topEightQueueSets } from './topEightQueue';
import { detectTopEightOpeningSets } from './topEightMatchups';

it('orders Top 8 before any, some or all opening players are known, independently of labels and response order', () => {
  for (const missing of [0, 3, 8]) {
    const sets = createTestTopEightSets();
    sets.forEach((set, index) => {
      set.round = 'Ronda sin etiqueta';
      if (index * 2 < missing) set.entrantOne = undefined;
      if (index * 2 + 1 < missing) set.entrantTwo = undefined;
    });
    expect(topEightQueueSets([...sets].reverse())?.map(({ id }) => id)).toEqual([
      'ws1',
      'ws2',
      'lo1',
      'lo2',
      'q1',
      'q2',
      'wf',
      'ls',
      'lf',
      'gf',
      'reset'
    ]);
    if (missing) expect(detectTopEightOpeningSets(sets)).toBeUndefined();
  }
});

it('ends at Grand Finals when start.gg does not expose a reset', () => {
  const sets = createTestTopEightSets();
  expect(topEightQueueSets(sets.filter(({ id }) => id !== 'reset'))?.at(-1)?.id).toBe('gf');
});

it('includes a reset that shares Grand Finals prerequisites', () => {
  const sets = createTestTopEightSets();
  sets.find(({ id }) => id === 'reset')!.prerequisites = sets.find(({ id }) => id === 'gf')!.prerequisites;
  expect(topEightQueueSets(sets)?.at(-1)?.id).toBe('reset');
});

it('refuses incomplete or ambiguous paths instead of producing a partial queue', () => {
  const sets = createTestTopEightSets();
  expect(topEightQueueSets(sets.filter(({ id }) => id !== 'ls'))).toBeUndefined();
  expect(topEightQueueSets([...sets, { ...sets.find(({ id }) => id === 'wf')!, id: 'another-final' }])).toBeUndefined();
  const unresolved = sets.map((set) => ({ ...set, entrantOne: undefined, entrantTwo: undefined }));
  expect(topEightQueueSets(unresolved.filter(({ id }) => id !== 'ls'))).toBeUndefined();
  const otherBracket = unresolved.map((set) => ({
    ...set,
    id: `other-${set.id}`,
    phaseGroupId: 'other-finals',
    prerequisites: set.prerequisites?.map((source) => ({ ...source, setId: `other-${source.setId}` }))
  }));
  expect(topEightQueueSets([...unresolved, ...otherBracket])).toBeUndefined();
  sets[1]!.entrantOne = sets[0]!.entrantOne;
  expect(topEightQueueSets(sets)).toBeUndefined();
});
