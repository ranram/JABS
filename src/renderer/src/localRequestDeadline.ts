export class LocalRequestTimeoutError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown: boolean
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Bound discovery, headers and body reads, even if an operation ignores abort. */
export async function withLocalRequestDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  caller: AbortSignal | null | undefined,
  timeoutMs: number,
  timeoutError: LocalRequestTimeoutError
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(caller?.reason);
  let rejectAborted!: (reason: unknown) => void;
  const interrupted = new Promise<never>((_, reject) => {
    rejectAborted = reject;
  });
  const interruptedSignal = () => rejectAborted(controller.signal.reason);
  controller.signal.addEventListener('abort', interruptedSignal, { once: true });
  caller?.addEventListener('abort', abort, { once: true });
  if (caller?.aborted) abort();
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  try {
    return await Promise.race([
      interrupted,
      controller.signal.aborted ? Promise.reject(controller.signal.reason) : run(controller.signal)
    ]);
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', interruptedSignal);
  }
}
