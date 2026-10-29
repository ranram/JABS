import { expect, it } from 'vitest';
import { createTestTopEightSets } from './testFixtures';
import { topEightQueueSets } from './topEightQueue';

it('orders the full Top 8 with TBD rounds and an exposed reset regardless of labels or response order', () => {
  const sets = createTestTopEightSets();
  sets.forEach((set) => {
    set.round = 'Ronda sin etiqueta';
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
});
