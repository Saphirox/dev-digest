/**
 * Insertion-order-evicting bounded cache. `pr_brief` has no sha column and
 * stores a composed `PrBrief` for a future lesson, so it doesn't fit a
 * head_sha-keyed history cache (see the plan's Architecture constraints) —
 * this in-memory `Map` wrapper stands in instead. Structurally satisfies
 * `PriorPrCache<V>` (`ports.ts`) without importing it.
 */
export class BoundedCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly maxEntries: number) {}

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  set(key: string, value: V): void {
    // Re-insert so an updated key also refreshes its recency (moves to the
    // end of the Map's iteration order, which IS insertion order in JS).
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
}
