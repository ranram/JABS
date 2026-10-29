import { describe, expect, it } from 'vitest';
import { resources } from './resources';
import nativeSpanish from './nativeErrors.es-419.json';

describe('renderer localization catalogs', () => {
  it('keeps translation keys and interpolation parameters in parity', async () => {
    for (const [source, translated] of Object.entries(nativeSpanish)) {
      expect(translated.trim(), source).not.toBe('');
      expect([...translated.matchAll(/\{(\w*)\}/g)].map((item) => item[1]).sort(), source).toEqual(
        [...source.matchAll(/\{(\w*)\}/g)].map((item) => item[1]).sort()
      );
    }
    const english = flatten(resources.en);
    const spanish = flatten(resources['es-419']);

    expect([...spanish.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, englishValue] of english) {
      expect(spanish.get(key)?.trim(), key).not.toBe('');
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
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)].map((match) => match[1]).sort();
}
