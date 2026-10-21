import { invoke } from '@tauri-apps/api/core';

export type DiagnosticArea =
  | 'app'
  | 'stream'
  | 'bracket'
  | 'startgg'
  | 'reporting'
  | 'assets'
  | 'generators'
  | 'obs'
  | 'settings'
  | 'players'
  | 'desktop'
  | 'updates';
type DiagnosticReason =
  | 'network'
  | 'timeout'
  | 'permission'
  | 'rate-limit'
  | 'upstream'
  | 'invalid-response'
  | 'validation'
  | 'storage'
  | 'not-found'
  | 'unavailable'
  | 'type-error'
  | 'reference-error'
  | 'unknown';
export type DiagnosticContext = {
  area?: DiagnosticArea;
  reason?: DiagnosticReason;
  status?: number;
  line?: number;
  column?: number;
};
export type DiagnosticEvent =
  | 'stream-save:renderer-start'
  | 'stream-save:renderer-complete'
  | 'stream-save:renderer-failed'
  | 'local-request:retry'
  | 'local-request:failed'
  | 'renderer-error'
  | 'renderer-rejection'
  | 'native-command-failed'
  | 'realtime-disconnected'
  | 'realtime-reconnected'
  | 'export-failed'
  | 'image-failed'
  | 'invalid-response';
type Transport = (event: DiagnosticEvent, context: DiagnosticContext) => Promise<unknown>;
let overlayTransport: Transport | undefined;
let pending = 0;

export function setOverlayDiagnosticTransport(transport: Transport): void {
  overlayTransport = transport;
}

export function recordDiagnostic(event: DiagnosticEvent, context: DiagnosticContext = {}): void {
  if (pending >= 8) return;
  const native = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  if (!native && !overlayTransport) return;
  // Pick fields explicitly: callers cannot accidentally serialize an Error,
  // command arguments, player data, or a request body into the report.
  const safe = {
    area: context.area ?? 'app',
    reason: context.reason,
    status: context.status,
    line: context.line,
    column: context.column
  };
  pending++;
  void Promise.resolve()
    .then(() =>
      native ? invoke('report_renderer_diagnostic', { event, context: safe }) : overlayTransport?.(event, safe)
    )
    .catch(() => undefined)
    .finally(() => {
      pending--;
    });
}

export function diagnosticArea(operation: string): DiagnosticArea {
  if (operation.includes('stinger')) return 'obs';
  if (operation.includes('report')) return 'reporting';
  if (operation.includes('startgg')) return 'startgg';
  if (operation.includes('player') || operation.includes('library')) return 'players';
  if (operation.includes('asset') || operation.includes('media')) return 'assets';
  if (operation.includes('update')) return 'updates';
  if (operation.includes('appearance') || operation.includes('settings')) return 'settings';
  return 'desktop';
}

function errorContext(error: unknown): DiagnosticContext {
  return {
    reason: error instanceof TypeError ? 'type-error' : error instanceof ReferenceError ? 'reference-error' : 'unknown'
  };
}

function position(value: number): number | undefined {
  return Number.isSafeInteger(value) && value > 0 && value <= 10_000_000 ? value : undefined;
}

export function trackRendererErrors(): () => void {
  const error = (event: ErrorEvent) =>
    recordDiagnostic('renderer-error', {
      ...errorContext(event.error),
      line: position(event.lineno),
      column: position(event.colno)
    });
  const rejected = (event: PromiseRejectionEvent) => recordDiagnostic('renderer-rejection', errorContext(event.reason));
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejected);
  return () => {
    window.removeEventListener('error', error);
    window.removeEventListener('unhandledrejection', rejected);
  };
}
