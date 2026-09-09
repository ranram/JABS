import { beforeAll, describe, expect, it } from 'vitest';
import { i18n, normalizeLocale } from './index';
import { localizedStartggError } from './startggErrors';
import { resources } from './resources';
import { noticeTone } from '../ui/operator/operatorUtils';

describe('renderer localization catalogs', () => {
  beforeAll(async () => {
    await i18n.init({ resources, lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false } });
  });
  it('normalizes supported locales and classifies start.gg failures in both languages', async () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('es-HN')).toBe('es-419');
    expect(normalizeLocale('ES')).toBe('es-419');
    expect(normalizeLocale('fr-FR')).toBeUndefined();
    expect(normalizeLocale('../../remote-catalog')).toBeUndefined();
    expect(localizedStartggError({ code: 'anonymous-unavailable', error: 'upstream implementation detail' }, 'Failed'))
      .toBe(i18n.t('errors:startgg.publicUnavailable'));
  });

  it('keeps catalog interpolation and notification behavior in parity', async () => {
    const english = flatten(resources.en);
    const spanish = flatten(resources['es-419']);

    expect([...spanish.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, englishValue] of english) {
      expect(interpolations(spanish.get(key) ?? ''), key).toEqual(interpolations(englishValue));
    }
    const previous = i18n.language;
    try {
      for (const locale of ['en', 'es-419']) {
        await i18n.changeLanguage(locale);
        expect(noticeTone(localizedStartggError({ code: 'token-missing' }, 'Failed'))).toBe('warning');
        expect(noticeTone(i18n.t('operator:startgg.reportToken'))).toBe('warning');
        for (const code of ['anonymous-unavailable', 'authentication', 'permission', 'rate-limit',
          'query-complexity', 'timeout', 'network', 'upstream', 'invalid-response', 'graphql', 'conflict']) {
          expect(noticeTone(localizedStartggError({ code }, 'Failed')), `${locale}: ${code}`).toBe('error');
        }
      }
    } finally {
      await i18n.changeLanguage(previous);
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
