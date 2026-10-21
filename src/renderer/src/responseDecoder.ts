import { i18n } from './i18n';
import { recordDiagnostic } from './diagnostics';

export type ResponseDecoder<T> = {
  parse(value: unknown): T;
};

export function decodeResponse<T>(value: unknown, decoder: ResponseDecoder<T> | undefined, source: string): T {
  if (!decoder) return value as T;
  try {
    return decoder.parse(value);
  } catch {
    recordDiagnostic('invalid-response', { reason: 'invalid-response' });
    throw new Error(i18n.t('errors:invalidLocalResponse', { source }));
  }
}
