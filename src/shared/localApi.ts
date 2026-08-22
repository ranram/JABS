export const localApiActionHeader = 'X-JABS-Action';
export const localApiActionHeaderValue = 'renderer-v1';

export function isLocalApiMutation(method: string | undefined): boolean {
  const normalizedMethod = (method ?? 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod);
}
