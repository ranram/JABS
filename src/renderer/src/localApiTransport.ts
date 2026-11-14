import { LocalRequestTimeoutError, withLocalRequestDeadline } from './localRequestDeadline';
import { measureWork } from './performanceMetrics';
import { requestOperation } from './diagnosticOperations';
import type { StartggErrorCode } from '@shared/models';
import { beginPendingWrite } from './pendingWrites';
import { decodeResponse, type ResponseDecoder } from './responseDecoder';
import type { DiagnosticOperation } from './diagnosticOperations';
import { RequestTrace, httpFailureReason, requestFailureReason } from './requestDiagnostics';
import { withJsonBodyHeaders } from './requestInit';
import { i18n } from './i18n';
import { localizedStartggError } from './i18n/startggErrors';

type RequestOptions<T> = {
  diagnosticOperation?: DiagnosticOperation;
  timeoutMs?: number;
  retryNetworkFailure?: boolean;
  decoder?: ResponseDecoder<T>;
  /** Whether this request holds edits and match navigation while it runs. */
  trackPendingWrite?: boolean;
};

export class LocalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'LocalApiError';
  }
}

export function createLocalApiTransport(apiBasePromise: Promise<string>) {
  async function request<T>(path: string, init?: RequestInit, options: RequestOptions<T> = {}): Promise<T> {
    const finish =
      options.trackPendingWrite !== false && init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())
        ? beginPendingWrite()
        : undefined;
    const finishMeasure = measureWork(options.diagnosticOperation ?? requestOperation(path));
    try {
      return await performRequest(path, init, options);
    } finally {
      finishMeasure();
      finish?.();
    }
  }

  async function performRequest<T>(path: string, init?: RequestInit, options: RequestOptions<T> = {}): Promise<T> {
    const trace = new RequestTrace(path, init?.method, options.diagnosticOperation);
    const write = Boolean(init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase()));
    const timeoutError = new LocalRequestTimeoutError(
      i18n.t(write ? 'errors:localWriteTimeout' : 'errors:localReadTimeout'),
      write
    );
    const bulk = [
      '/api/match-queue/add',
      '/api/players/import-event',
      '/api/players/import',
      '/api/assets/game-characters/prepare',
      '/api/startgg/event-standings',
      '/api/broadcast/bracket-screen/refresh'
    ];
    const timeoutMs = options.timeoutMs ?? (bulk.includes(path.split('?')[0]) ? 600_000 : 120_000);
    try {
      return await withLocalRequestDeadline(
        (signal) => performWithinDeadline(path, { ...init, signal }, options, trace),
        init?.signal,
        timeoutMs,
        timeoutError
      );
    } catch (error) {
      if (error === timeoutError) trace.record('local-request:failed', 'timeout');
      else if (init?.signal?.aborted) {
        const reason = requestFailureReason(init.signal.reason, init.signal);
        trace.record(reason === 'cancelled' ? 'local-request:cancelled' : 'local-request:failed', reason);
        throw init.signal.reason;
      }
      throw error;
    }
  }

  async function performWithinDeadline<T>(
    path: string,
    init: RequestInit,
    options: RequestOptions<T>,
    trace: RequestTrace
  ): Promise<T> {
    const apiBase = await apiBasePromise;
    if (init.signal?.aborted) throw init.signal.reason;
    function transportFailure(error: unknown): void {
      if (init.signal?.aborted) return;
      const reason = requestFailureReason(error, init?.signal);
      trace.record(reason === 'cancelled' ? 'local-request:cancelled' : 'local-request:failed', reason);
    }
    let response: Response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...withJsonBodyHeaders(init)
      });
    } catch (error) {
      const reason = requestFailureReason(error, init?.signal);
      if (reason === 'cancelled' || reason === 'timeout') {
        transportFailure(error);
        if (reason === 'cancelled') throw error;
        throw new Error(i18n.t('errors:localService', { url: apiBase }));
      }
      if (options.retryNetworkFailure) {
        trace.record('local-request:retry', reason);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        if (init?.signal?.aborted) {
          transportFailure(init.signal.reason);
          if (requestFailureReason(init.signal.reason, init.signal) === 'cancelled') throw init.signal.reason;
          throw new Error(i18n.t('errors:localService', { url: apiBase }));
        }
        trace.attempt = 2;
        try {
          response = await fetch(`${apiBase}${path}`, {
            ...withJsonBodyHeaders(init)
          });
        } catch (retryError) {
          transportFailure(retryError);
          if (requestFailureReason(retryError, init?.signal) === 'cancelled') throw retryError;
          throw new Error(i18n.t('errors:localServiceAfterRetry', { url: apiBase }));
        }
      } else {
        transportFailure(error);
        throw new Error(i18n.t('errors:localService', { url: apiBase }));
      }
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as
        | {
            error?: string;
            code?: StartggErrorCode;
          }
        | undefined;
      trace.record('local-request:failed', httpFailureReason(response.status), response.status);
      throw new LocalApiError(localizedResponseError(payload, response.status), response.status, payload?.code);
    }

    if (response.status === 204) {
      if (trace.attempt > 1) trace.record('local-request:recovered', undefined, response.status);
      return undefined as T;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (!(error instanceof SyntaxError) || init?.signal?.aborted) {
        transportFailure(error);
        if (requestFailureReason(error, init?.signal) === 'cancelled') throw error;
        throw new Error(i18n.t('errors:localService', { url: apiBase }));
      }
      trace.record('invalid-response', 'invalid-response', response.status);
      throw new Error(i18n.t('errors:invalidLocalResponse', { source: path }));
    }
    const result = decodeResponse(payload, options.decoder, path, trace.context('invalid-response', response.status));
    if (trace.attempt > 1) trace.record('local-request:recovered', undefined, response.status);
    return result;
  }

  function localizedResponseError(
    payload: { error?: string; code?: StartggErrorCode } | undefined,
    status: number
  ): string {
    return localizedStartggError(payload, i18n.t('errors:http', { status }));
  }

  return { request, performRequest };
}
