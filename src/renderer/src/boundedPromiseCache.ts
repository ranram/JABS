/** Small least-recently-used cache that also deduplicates in-flight work. */
export class BoundedPromiseCache<T> {
  private readonly entries = new Map<string, Promise<T>>();

  constructor(private readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error('Cache capacity must be a positive integer.');
    }
  }

  getOrCreate(key: string, create: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }

    const pending = create();
    this.entries.set(key, pending);
    pending.catch(() => {
      if (this.entries.get(key) === pending) this.entries.delete(key);
    });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return pending;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
