import type { MediaDirectoryKind } from './desktopRuntime';

/**
 * Joins a native catalog root with a repository-relative subpath for display,
 * keeping the platform's own separator so Windows paths stay copy-pasteable.
 */
export function joinMediaDisplayPath(root: string, subpath?: string): string {
  const separator = root.includes('\\') ? '\\' : '/';
  const base = root.endsWith('/') || root.endsWith('\\') ? root : `${root}${separator}`;
  if (!subpath) return base;
  return `${base}${subpath.split('/').filter(Boolean).join(separator)}${separator}`;
}

/**
 * Fallback hint shown outside the desktop runtime (plain-browser dev), where
 * catalogs live at the repository root.
 */
export function relativeMediaHint(kind: MediaDirectoryKind, subpath?: string): string {
  return subpath ? `${kind}/${subpath}/` : `${kind}/`;
}
