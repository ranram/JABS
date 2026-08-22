import {
  isLocalApiMutation,
  localApiActionHeader,
  localApiActionHeaderValue
} from '../../shared/localApi';

export function withJsonBodyHeaders(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (isLocalApiMutation(init.method)) {
    headers.set(localApiActionHeader, localApiActionHeaderValue);
  }

  return {
    ...init,
    headers
  };
}
