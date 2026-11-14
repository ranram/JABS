/** Small least-recently-used cache that also deduplicates in-flight work. */
export class BoundedPromiseCache<T> {
  private readonly entries = new Map<string, Promise<T>>();
  private readonly weights = new Map<string, number>();
  private weight = 0;

  constructor(
    private readonly capacity: number,
    private readonly budget?: { maxWeight: number; weigh(value: T, key: string): number }
  ) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      (budget && (!Number.isFinite(budget.maxWeight) || budget.maxWeight <= 0))
    ) {
      throw new Error('Cache limits must be positive finite numbers.');
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
    pending.then(
      (value) => {
        if (this.entries.get(key) !== pending || !this.budget) return;
        const weight = this.budget.weigh(value, key);
        if (!Number.isFinite(weight) || weight < 0) {
          this.remove(key);
          return;
        }
        this.weights.set(key, weight);
        this.weight += weight;
        this.trim();
      },
      () => {
        if (this.entries.get(key) === pending) this.remove(key);
      }
    );
    this.trim();
    return pending;
  }

  private remove(key: string): void {
    this.weight -= this.weights.get(key) ?? 0;
    this.weights.delete(key);
    this.entries.delete(key);
  }

  private trim(): void {
    while (this.entries.size > this.capacity || (this.budget && this.weight > this.budget.maxWeight)) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
    this.weights.clear();
    this.weight = 0;
  }

  get size(): number {
    return this.entries.size;
  }
}
