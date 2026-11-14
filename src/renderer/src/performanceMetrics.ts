import type { DiagnosticOperation } from './diagnosticOperations';

type Metric = DiagnosticOperation | 'image-decode' | 'image-bounds' | 'image-encode' | 'image-trim';
type Sample = { count: number; totalMs: number; maxMs: number };
const samples = new Map<Metric, Sample>();

/** Development-only totals. Keys never contain URLs, asset names or player data. */
export function measureWork(metric: Metric): () => void {
  if (!import.meta.env.DEV) return () => undefined;
  const started = performance.now();
  return () => {
    const elapsed = performance.now() - started;
    const previous = samples.get(metric) ?? { count: 0, totalMs: 0, maxMs: 0 };
    samples.set(metric, {
      count: previous.count + 1,
      totalMs: previous.totalMs + elapsed,
      maxMs: Math.max(previous.maxMs, elapsed)
    });
  };
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  Object.assign(window, {
    jabsPerformance: {
      read: () => Object.fromEntries([...samples].map(([key, value]) => [key, { ...value }])),
      clear: () => samples.clear()
    }
  });
}
