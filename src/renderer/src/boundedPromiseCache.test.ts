import { describe, expect, it, vi } from 'vitest';
import { BoundedPromiseCache } from './boundedPromiseCache';

describe('BoundedPromiseCache', () => {
  it('deduplicates work, evicts least-recently-used values, and retries rejection', async () => {
    const create = vi.fn(async () => 'asset');
    const cache = new BoundedPromiseCache<string>(2);
    const first = cache.getOrCreate('a', create);
    expect(cache.getOrCreate('a', create)).toBe(first);
    await expect(first).resolves.toBe('asset');
    expect(create).toHaveBeenCalledOnce();
    await cache.getOrCreate('b', async () => 'b1');
    await cache.getOrCreate('c', async () => 'c1');
    await expect(cache.getOrCreate('a', async () => 'a2')).resolves.toBe('a2');
    await expect(cache.getOrCreate('failed', async () => { throw new Error('nope'); })).rejects.toThrow('nope');
    await expect(cache.getOrCreate('failed', async () => 'recovered')).resolves.toBe('recovered');
  });
});

it('limits retained data by weight and ignores late results after clearing', async () => {
  const cache = new BoundedPromiseCache<string>(10, { maxWeight: 6, weigh: (value) => value.length });
  await cache.getOrCreate('a', async () => 'aaa');
  await cache.getOrCreate('b', async () => 'bbb');
  await cache.getOrCreate('a', async () => 'unused');
  await cache.getOrCreate('c', async () => 'cc');
  expect(cache.size).toBe(2);
  const reload = vi.fn(async () => 'b');
  await cache.getOrCreate('b', reload);
  expect(reload).toHaveBeenCalledOnce();
  let finish!: (value: string) => void;
  const late = cache.getOrCreate('late', () => new Promise<string>((resolve) => { finish = resolve; }));
  cache.clear();
  finish('oversized');
  await late;
  expect(cache.size).toBe(0);
  await cache.getOrCreate('huge', async () => 'larger than the entire budget');
  expect(cache.size).toBe(0);
  const keyed = new BoundedPromiseCache<string>(2, { maxWeight: 4, weigh: (value, key) => value.length + key.length });
  await keyed.getOrCreate('large-input-key', async () => 'a');
  expect(keyed.size).toBe(0);
});
