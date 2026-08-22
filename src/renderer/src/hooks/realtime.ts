const MIN_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 10_000;

export function reconnectDelay(attempt: number): number {
  return Math.min(
    MIN_RECONNECT_DELAY_MS * 2 ** Math.max(0, Math.trunc(attempt)),
    MAX_RECONNECT_DELAY_MS
  );
}

export function parseRealtimeJson<T>(
  value: unknown,
  parse: (message: unknown) => T | undefined
): T | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return parse(JSON.parse(value));
  } catch {
    return undefined;
  }
}
