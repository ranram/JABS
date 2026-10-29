import { diagnosticArea, recordDiagnostic, type DiagnosticContext, type DiagnosticEvent } from './diagnostics';
import { requestOperation, type DiagnosticMethod, type DiagnosticOperation } from './diagnosticOperations';

export function requestFailureReason(error: unknown, signal?: AbortSignal | null): DiagnosticContext['reason'] {
  const name = signal?.aborted
    ? signal.reason?.name
    : error instanceof Error || error instanceof DOMException
      ? error.name
      : undefined;
  if (name === 'TimeoutError') return 'timeout';
  if (signal?.aborted || name === 'AbortError') return 'cancelled';
  return 'network';
}

export function httpFailureReason(status: number): DiagnosticContext['reason'] {
  if (status === 401 || status === 403) return 'permission';
  if (status === 404) return 'not-found';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'server';
  return status >= 400 ? 'validation' : 'unknown';
}

export class RequestTrace {
  readonly operation: DiagnosticOperation;
  readonly method: DiagnosticMethod;
  // Anonymous IDs distinguish simultaneous requests and separate renderer instances.
  private readonly id = crypto.getRandomValues(new Uint32Array(2));
  private readonly started = performance.now();
  attempt = 1;

  constructor(path: string, method = 'GET', operation?: DiagnosticOperation) {
    this.operation = operation ?? requestOperation(path);
    const verb = method.toUpperCase();
    this.method = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(verb)
      ? (verb as DiagnosticMethod)
      : 'OTHER';
  }

  context(reason?: DiagnosticContext['reason'], status?: number): DiagnosticContext {
    return {
      area: diagnosticArea(this.operation),
      operation: this.operation,
      method: this.method,
      requestId: this.id[0] * 0x20_0000 + (this.id[1] >>> 11),
      attempt: this.attempt,
      elapsedMs: Math.min(86_400_000, Math.max(0, Math.round(performance.now() - this.started))),
      reason,
      status
    };
  }

  record(event: DiagnosticEvent, reason?: DiagnosticContext['reason'], status?: number) {
    recordDiagnostic(event, this.context(reason, status));
  }
}
