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
