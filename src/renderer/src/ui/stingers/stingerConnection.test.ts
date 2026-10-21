// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../api';

const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
afterEach(() => {
  if (timeoutDescriptor) Object.defineProperty(AbortSignal, 'timeout', timeoutDescriptor);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('recovers a stalled heartbeat and reconnects on OBS browsers without AbortSignal.timeout', async () => {
  vi.useFakeTimers();
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  const fetch = vi.fn().mockImplementationOnce(
    (_url, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('Connection timed out')), { once: true });
      })
  );
  vi.stubGlobal('fetch', fetch);
  const failed = api.stingerSource('source-one', true, true).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await failed).toBeInstanceOf(Error);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  const snapshot = {
    connectionId: 'recovered',
    readySources: 1,
    settings: {
      perfect: {},
      winner: {},
      automaticWinner: false,
      mediaDelaySeconds: 0,
      videoLayer: 'foreground',
      updatedAt: '1'
    }
  };
  fetch.mockImplementation(async () => new Response(JSON.stringify(snapshot), { status: 200 }));
  expect(await api.stingerSource('source-one', true, true)).toEqual(snapshot);
  expect(await api.stingers()).toEqual(snapshot);
  expect(await api.reconnectStingers()).toEqual(snapshot);
  const [, heartbeat] = fetch.mock.calls[1];
  expect(new Headers(heartbeat.headers).get('X-JABS-Action')).toBe('renderer-v1');
  expect(JSON.parse(heartbeat.body)).toEqual({ clientId: 'source-one', active: true, program: true });
  expect(vi.getTimerCount()).toBe(0);
});
