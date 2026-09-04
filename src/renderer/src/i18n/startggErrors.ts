import type { StartggErrorCode } from '@shared/models';
import { i18n } from './index';

const translationKeys = {
  'token-missing': 'errors:startgg.tokenMissing',
  authentication: 'errors:startgg.authentication',
  permission: 'errors:startgg.permission',
  'rate-limit': 'errors:startgg.rateLimit',
  'query-complexity': 'errors:startgg.queryComplexity',
  timeout: 'errors:startgg.timeout',
  network: 'errors:startgg.network',
  upstream: 'errors:startgg.upstream',
  'invalid-response': 'errors:startgg.invalidResponse',
  graphql: 'errors:startgg.graphql',
  conflict: 'errors:startgg.conflict'
} as const satisfies Record<StartggErrorCode, string>;

export function localizedStartggError(
  payload: { error?: string; code?: string } | undefined,
  fallback: string
): string {
  if (payload?.code && payload.code in translationKeys) {
    return i18n.t(translationKeys[payload.code as StartggErrorCode]);
  }
  return payload?.error ?? fallback;
}
