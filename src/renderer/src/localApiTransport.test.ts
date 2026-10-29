// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createLocalApiTransport } from './localApiTransport';
import { initializeI18n } from './i18n';
import {
  dynamicOperations,
  nativeOperations,
  queueOperations,
  requestOperation,
  requestOperations
} from './diagnosticOperations';

const diagnostics = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock('./diagnostics', async (original) => ({
  ...(await original<typeof import('./diagnostics')>()),
  recordDiagnostic: diagnostics.record
}));
beforeAll(initializeI18n);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  diagnostics.record.mockClear();
});
const { performRequest } = createLocalApiTransport(Promise.resolve('http://127.0.0.1:4279'));

it('identifies a failed queue read without retaining query values, bodies, or error text', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      clock.mockReturnValue(150);
      throw new TypeError('private token and player text');
    })
  );
  await expect(
    performRequest('/api/match-queue?private=query', {
      headers: { Authorization: 'private token' },
      body: 'private body'
    })
  ).rejects.toThrow();
  expect(diagnostics.record).toHaveBeenCalledExactlyOnceWith('local-request:failed', {
    area: 'bracket',
    operation: 'queue-read',
    method: 'GET',
    reason: 'network',
    requestId: expect.any(Number),
    elapsedMs: 50,
    attempt: 1,
    status: undefined
  });
  expect(JSON.stringify(diagnostics.record.mock.calls)).not.toContain('private');
});

it('correlates a retry with its successful recovery without logging ordinary successful requests', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockImplementation(async () => new Response('{"ready":true}'));
  vi.stubGlobal('fetch', fetcher);
  const pending = performRequest('/api/state/selected-set', { method: 'PUT' }, { retryNetworkFailure: true });
  await vi.advanceTimersByTimeAsync(120);
  await expect(pending).resolves.toEqual({ ready: true });
  const [retry, recovered] = diagnostics.record.mock.calls;
  expect(retry).toEqual([
    'local-request:retry',
    expect.objectContaining({
      operation: 'selected-set',
      method: 'PUT',
      reason: 'network',
      attempt: 1
    })
  ]);
  expect(recovered).toEqual([
    'local-request:recovered',
    expect.objectContaining({
      requestId: retry[1].requestId,
      attempt: 2,
      status: 200
    })
  ]);
  await performRequest('/api/health');
  expect(diagnostics.record).toHaveBeenCalledTimes(2);
});

it('distinguishes a heartbeat timeout from expected cancellation and never retries either', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const contexts = [];
  for (const name of ['AbortError', 'TimeoutError']) {
    const controller = new AbortController();
    controller.abort(new DOMException('', name));
    fetcher.mockRejectedValueOnce(controller.signal.reason);
    await expect(
      performRequest(
        '/api/match-queue/heartbeat',
        { method: 'POST', signal: controller.signal },
        { retryNetworkFailure: true }
      )
    ).rejects.toThrow();
    const [event, context] = diagnostics.record.mock.calls.at(-1)!;
    expect(event).toBe(name === 'AbortError' ? 'local-request:cancelled' : 'local-request:failed');
    expect(context).toMatchObject({
      operation: 'queue-heartbeat',
      method: 'POST',
      reason: name === 'AbortError' ? 'cancelled' : 'timeout',
      attempt: 1
    });
    contexts.push(context);
  }
  expect(contexts[0].requestId).not.toBe(contexts[1].requestId);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(diagnostics.record).toHaveBeenCalledTimes(2);
});

it('honors cancellation during the retry delay', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'));
  vi.stubGlobal('fetch', fetcher);
  const pending = performRequest('/api/state', { signal: controller.signal }, { retryNetworkFailure: true });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(60);
  controller.abort();
  await vi.advanceTimersByTimeAsync(60);
  await rejected;
  expect(fetcher).toHaveBeenCalledOnce();
  expect(diagnostics.record.mock.calls.at(-1)).toEqual([
    'local-request:cancelled',
    expect.objectContaining({ reason: 'cancelled', attempt: 1 })
  ]);
});

it('recognizes cancellation while reading a successful response body', async () => {
  const controller = new AbortController();
  const response = new Response('{}');
  response.json = async () => {
    controller.abort();
    throw controller.signal.reason;
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response)
  );
  await expect(performRequest('/api/match-queue', { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError'
  });
  expect(diagnostics.record).toHaveBeenCalledExactlyOnceWith(
    'local-request:cancelled',
    expect.objectContaining({ operation: 'queue-read', reason: 'cancelled' })
  );
});

it.each([
  [403, 'permission'],
  [429, 'rate-limit'],
  [503, 'server']
] as const)('records HTTP %s with a fixed queue action and reason %s', async (status, reason) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"error":"private rejection"}', { status }))
  );
  await expect(
    performRequest(
      '/api/match-queue/action',
      { method: 'POST', body: 'private set IDs' },
      { diagnosticOperation: 'queue-clear' }
    )
  ).rejects.toThrow();
  expect(diagnostics.record).toHaveBeenCalledWith(
    'local-request:failed',
    expect.objectContaining({
      operation: 'queue-clear',
      reason,
      status,
      method: 'POST'
    })
  );
  expect(JSON.stringify(diagnostics.record.mock.calls)).not.toContain('private');
});

it.each([false, true])('identifies malformed JSON and schema failures (schema=%s)', async (schema) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(schema ? '{}' : 'private invalid json'))
  );
  const decoder = {
    parse() {
      throw new Error('private schema details');
    }
  };
  await expect(performRequest('/api/match-queue', undefined, schema ? { decoder } : {})).rejects.toThrow();
  expect(diagnostics.record).toHaveBeenCalledExactlyOnceWith(
    'invalid-response',
    expect.objectContaining({
      operation: 'queue-read',
      method: 'GET',
      reason: 'invalid-response',
      status: 200
    })
  );
  expect(JSON.stringify(diagnostics.record.mock.calls)).not.toContain('private');
});

it('keeps renderer operation labels compatible with native logs and strips dynamic values', () => {
  const native = readFileSync('src-tauri/src/diagnostics/operations.rs', 'utf8');
  const variants = native
    .split('pub enum Operation {')[1]
    .split('}')[0]
    .trim()
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/[A-Z]/g, (letter, index) => (index ? '-' : '') + letter.toLowerCase()));
  const labels = new Set([
    ...Object.values(requestOperations),
    ...Object.values(queueOperations),
    ...Object.values(nativeOperations),
    ...dynamicOperations
  ]);
  expect(new Set(variants)).toEqual(labels);
  for (const file of ['src/renderer/src/api.ts', 'src/renderer/src/matchQueueApi.ts']) {
    const source = readFileSync(file, 'utf8');
    const routes = source.matchAll(/['"`]([/]api[/][a-z/-]+)(?:[?]|['"`])/g);
    for (const [, route] of routes) {
      expect(requestOperation(route), `${file}: ${route}`).not.toBe('other-local-request');
    }
  }
  expect(requestOperation('/api/players/private-ID?token=private')).toBe('player-record');
  expect(requestOperation('/api/custom-scoreboards/private-ID')).toBe('custom-scoreboard-record');
  expect(requestOperation('/api/broadcast/stingers/video/winner?name=private')).toBe('stinger-video');
  expect(requestOperation('/private/unknown')).toBe('other-local-request');
});
