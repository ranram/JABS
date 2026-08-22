import { describe, expect, it } from 'vitest';
import { normalizeLocale } from './index';
import { resources } from './resources';

describe('renderer localization catalogs', () => {
  it('normalizes only the supported English and Latin American Spanish locales', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('es-HN')).toBe('es-419');
    expect(normalizeLocale('ES')).toBe('es-419');
    expect(normalizeLocale('fr-FR')).toBeUndefined();
    expect(normalizeLocale('../../remote-catalog')).toBeUndefined();
  });

  it('keeps catalog keys and interpolation variables in parity', () => {
    const english = flatten(resources.en);
    const spanish = flatten(resources['es-419']);

    expect([...spanish.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, englishValue] of english) {
      expect(interpolations(spanish.get(key) ?? ''), key).toEqual(interpolations(englishValue));
    }
  });
});

function flatten(value: object, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') result.set(path, child);
    else {
      for (const [nestedKey, nestedValue] of flatten(child, path)) {
        result.set(nestedKey, nestedValue);
      }
    }
  }
  return result;
}

function interpolations(value: string): string[] {
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)]
    .map((match) => match[1])
    .sort();
}
