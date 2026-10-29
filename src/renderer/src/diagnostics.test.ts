// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { invokeNative } from './nativeCommand';
import { trackRendererErrors } from './diagnostics';

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }));

it('records useful failure metadata without exporting messages, paths, command arguments, or rejection payloads', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  bridge.invoke.mockImplementation(async (command: string) => {
    if (command === 'set_startgg_token') throw new Error('private secret /home/private-user');
  });
  const stop = trackRendererErrors();
  try {
    await expect(invokeNative('set_startgg_token', { token: 'private secret' })).rejects.toThrow();
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'private player text',
        filename: '/home/private-user/file.js',
        error: new TypeError('private player text'),
        lineno: 42,
        colno: 7
      })
    );
    const rejected = new Event('unhandledrejection');
    Object.defineProperty(rejected, 'reason', { value: { token: 'private secret', name: 'private player text' } });
    window.dispatchEvent(rejected);
    await vi.waitFor(() => expect(bridge.invoke).toHaveBeenCalledTimes(4));
    const diagnostics = bridge.invoke.mock.calls.filter(([command]) => command === 'report_renderer_diagnostic');
    expect(diagnostics.map(([, payload]) => payload)).toEqual([
      { event: 'native-command-failed', context: { area: 'startgg', operation: 'set-startgg-token' } },
      { event: 'renderer-error', context: { area: 'app', reason: 'type-error', line: 42, column: 7 } },
      { event: 'renderer-rejection', context: { area: 'app', reason: 'unknown' } }
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('private');
    bridge.invoke.mockRejectedValue(new Error('diagnostics unavailable'));
    window.dispatchEvent(new ErrorEvent('error', { error: new ReferenceError('private secret') }));
    await vi.waitFor(() => expect(bridge.invoke).toHaveBeenCalledTimes(5));
  } finally {
    stop();
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    bridge.invoke.mockReset();
    vi.unstubAllGlobals();
  }
});
