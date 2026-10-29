// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { deferred, mountHook } from './hookTestHarness';
import { useRealtimeState } from './useRealtimeState';
import { useLogoAssetUrl } from './useLogoAssetUrl';
import { useCatalogRevision, useGamePreparationRevision } from './useCatalogRevision';
import { api, acceptCatalogMessage } from '../api';
import { useStingers } from './useStingers';
import type { StingerState } from '@shared/stingers';
import { initializeI18n } from '../i18n';

beforeAll(initializeI18n);

const media = vi.hoisted(() => ({
  logo: vi.fn(async () => 'old-logo'),
  stingers: vi.fn(),
  reconnectStingers: vi.fn()
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    websocketUrl: async () => 'ws://127.0.0.1/ws',
    api: {
      ...actual.api,
      logoAssetUrl: media.logo,
      stingers: media.stingers,
      reconnectStingers: media.reconnectStingers
    }
  };
});
class Socket extends EventTarget {
  static instances: Socket[] = [];
  close = vi.fn();
  constructor() {
    super();
    Socket.instances.push(this);
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Socket.instances = [];
  media.stingers.mockReset();
  media.reconnectStingers.mockReset();
});

it('refreshes on-demand stats without overlapping slow loads or polling after unmount', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const pending = deferred<number>();
  const load = vi.fn().mockResolvedValueOnce(1).mockReturnValueOnce(pending.promise).mockResolvedValue(3);
  const parseMessage = () => undefined;
  const hook = await mountHook(() =>
    useRealtimeState({ load, parseMessage, loadError: 'Failed', refreshIntervalMs: 1000 })
  );
  expect(hook.current.state).toBe(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => {
    pending.resolve(2);
  });
  expect(hook.current.state).toBe(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(hook.current.state).toBe(3);
  await hook.unmount();
  await vi.advanceTimersByTimeAsync(5000);
  expect(load).toHaveBeenCalledTimes(3);
});

it('keeps socket updates newer than pending HTTP loads, including across reconnects', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const old = deferred<number>();
  const opened = deferred<number>();
  const reconnect = deferred<number>();
  const load = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(opened.promise)
    .mockReturnValueOnce(reconnect.promise);
  const parseMessage = (value: unknown) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : undefined;
  const hook = await mountHook(() => ({
    ...useRealtimeState({ load, parseMessage, loadError: 'Failed' }),
    logo: useLogoAssetUrl('logo.png'),
    catalogRevision: useCatalogRevision()
  }));
  const socket = Socket.instances[0]!;
  await act(async () => {
    socket.dispatchEvent(new Event('open'));
    socket.dispatchEvent(new MessageEvent('message', { data: '2' }));
    old.resolve(0);
    opened.resolve(1);
  });
  expect(hook.current.state).toBe(2);
  expect(hook.current.logo).toBe('old-logo');
  const catalogRevision = hook.current.catalogRevision;
  media.logo.mockResolvedValue('replaced-logo');
  const assetMessage = (revision: unknown) =>
    new MessageEvent('message', {
      data: JSON.stringify({ event: 'asset-catalog', revision })
    });
  await act(async () => {
    socket.dispatchEvent(assetMessage(100));
    socket.dispatchEvent(assetMessage(100));
  });
  expect(hook.current.logo).toBe('replaced-logo');
  expect(hook.current.catalogRevision).toBe(catalogRevision + 1);
  expect(media.logo).toHaveBeenCalledTimes(2);
  expect(hook.current.state).toBe(2);
  await act(async () => {
    // Some failures report an error without delivering a close event.
    socket.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(500);
    Socket.instances[1]!.dispatchEvent(new Event('open'));
    // A reconnect includes the current revision, catching reloads missed while offline.
    Socket.instances[1]!.dispatchEvent(assetMessage(101));
    Socket.instances[1]!.dispatchEvent(new MessageEvent('message', { data: '4' }));
    socket.dispatchEvent(new MessageEvent('message', { data: '0' }));
    reconnect.reject(new Error('Old load failed'));
  });
  expect(hook.current.state).toBe(4);
  expect(socket.close).toHaveBeenCalledOnce();
  expect(hook.current.error).toBeUndefined();
  expect(hook.current.catalogRevision).toBe(catalogRevision + 2);
  await act(async () => {
    for (const invalid of [-1, 1.5, '102', Number.MAX_SAFE_INTEGER + 1]) {
      Socket.instances[1]!.dispatchEvent(assetMessage(invalid));
    }
    socket.dispatchEvent(assetMessage(102));
  });
  expect(hook.current.catalogRevision).toBe(catalogRevision + 2);
  for (const delay of [500, 1_000, 2_000, 4_000, 8_000, 10_000, 10_000]) {
    const attempts = Socket.instances.length;
    await act(async () => {
      Socket.instances.at(-1)!.dispatchEvent(new Event('close'));
      await vi.advanceTimersByTimeAsync(delay - 1);
    });
    expect(Socket.instances).toHaveLength(attempts);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(Socket.instances).toHaveLength(attempts + 1);
  }
  const abandoned = Socket.instances.at(-1)!;
  const attempts = Socket.instances.length;
  const manual = deferred<number>();
  load.mockReturnValueOnce(manual.promise);
  await act(async () => hook.current.reconnect());
  expect(abandoned.close).toHaveBeenCalledOnce();
  expect(Socket.instances).toHaveLength(attempts + 1);
  await act(async () => abandoned.dispatchEvent(new MessageEvent('message', { data: '0' })));
  expect(hook.current.state).toBe(4);
  await act(async () => {
    Socket.instances.at(-1)!.dispatchEvent(new MessageEvent('message', { data: '5' }));
    manual.resolve(0);
  });
  expect(hook.current.state).toBe(5);
  await hook.unmount();
  expect(Socket.instances.at(-1)!.close).toHaveBeenCalledOnce();
});

it('renews the stinger stream on a source reset, preserving settings and refusing messages from the abandoned connection', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  const initial: StingerState = {
    connectionId: 'before',
    readySources: 1,
    settings: {
      perfect: {},
      winner: {},
      automaticWinner: true,
      mediaDelaySeconds: 0,
      videoLayer: 'foreground',
      updatedAt: '1'
    }
  };
  const recovered = { ...initial, connectionId: 'after', readySources: 0 };
  media.stingers.mockResolvedValue(initial);
  media.reconnectStingers.mockImplementation(async () => {
    media.stingers.mockResolvedValue(recovered);
    return recovered;
  });
  const hook = await mountHook(useStingers);
  const firstSocket = Socket.instances[0]!;
  await act(async () => {
    await hook.current.reconnectSources();
  });
  expect(media.reconnectStingers).toHaveBeenCalledOnce();
  expect(firstSocket.close).toHaveBeenCalledOnce();
  expect(hook.current.state).toEqual(recovered);
  await act(async () => {
    firstSocket.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify({ event: 'stinger-state', payload: initial }) })
    );
  });
  expect(hook.current.state).toEqual(recovered);
  const resetSocket = Socket.instances.at(-1)!;
  const healthy = { ...recovered, readySources: 1 };
  await act(async () => {
    resetSocket.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify({ event: 'stinger-state', payload: healthy }) })
    );
  });
  expect(hook.current.state?.readySources).toBe(1);
  // A server-side reset must also renew an OBS page's stream without an operator click in that page.
  const restarted = { ...healthy, connectionId: 'restart', readySources: 0 };
  media.stingers.mockResolvedValue(restarted);
  await act(async () => {
    resetSocket.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify({ event: 'stinger-state', payload: restarted }) })
    );
  });
  expect(resetSocket.close).toHaveBeenCalledOnce();
  expect(Socket.instances.at(-1)).not.toBe(resetSocket);
  expect(hook.current.state).toEqual(restarted);
});

it('keeps unchanged images cached and reserves folder setup for explicit reloads', async () => {
  const baseline = 10_000;
  acceptCatalogMessage(JSON.stringify({ event: 'asset-catalog', revision: baseline }));
  media.logo.mockResolvedValue('current-logo');
  media.logo.mockClear();
  let revision = baseline;
  let changed = false;
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ revision, changed }), {
        headers: { 'Content-Type': 'application/json' }
      })
  );
  vi.stubGlobal('fetch', fetcher);
  const view = await mountHook(() => ({
    revision: useCatalogRevision(),
    preparation: useGamePreparationRevision(),
    logo: useLogoAssetUrl('logo.png')
  }));
  const initial = { ...view.current };
  await act(async () => {
    await api.checkAssets();
  });
  expect(view.current).toEqual(initial);
  expect(media.logo).toHaveBeenCalledTimes(1);
  changed = true;
  revision++;
  await act(async () => {
    await api.checkAssets();
  });
  expect(view.current.revision).toBe(initial.revision + 1);
  expect(view.current.preparation).toBe(initial.preparation);
  expect(media.logo).toHaveBeenCalledTimes(2);
  revision++;
  await act(async () => {
    await api.reloadAssets();
  });
  expect(view.current.preparation).toBe(initial.preparation + 1);
  expect(media.logo).toHaveBeenCalledTimes(3);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
