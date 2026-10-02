// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { deferred, mountHook } from './hookTestHarness';
import { useRealtimeState } from './useRealtimeState';

vi.mock('../api', () => ({ websocketUrl: async () => 'ws://127.0.0.1/ws' }));
class Socket extends EventTarget {
  static instances: Socket[] = [];
  close = vi.fn();
  constructor() { super(); Socket.instances.push(this); }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); Socket.instances = []; });

it('keeps socket updates newer than pending HTTP loads, including across reconnects', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const old = deferred<number>();
  const opened = deferred<number>();
  const reconnect = deferred<number>();
  const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(opened.promise).mockReturnValueOnce(reconnect.promise);
  const parseMessage = (value: unknown) => Number(value);
  const hook = await mountHook(() => useRealtimeState({ load, parseMessage, loadError: 'Failed' }));
  const socket = Socket.instances[0]!;
  await act(async () => {
    socket.dispatchEvent(new Event('open'));
    socket.dispatchEvent(new MessageEvent('message', { data: '2' }));
    old.resolve(0);
    opened.resolve(1);
  });
  expect(hook.current.state).toBe(2);
  await act(async () => {
    socket.dispatchEvent(new Event('close'));
    await vi.advanceTimersByTimeAsync(500);
    Socket.instances[1]!.dispatchEvent(new Event('open'));
    Socket.instances[1]!.dispatchEvent(new MessageEvent('message', { data: '4' }));
    socket.dispatchEvent(new MessageEvent('message', { data: '0' }));
    reconnect.reject(new Error('Old load failed'));
  });
  expect(hook.current.state).toBe(4);
  expect(hook.current.error).toBeUndefined();
  await hook.unmount();
  expect(Socket.instances[1]!.close).toHaveBeenCalledOnce();
});
