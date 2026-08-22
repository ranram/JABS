import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, supportedLocales, type SupportedLocale } from './resources';

export const languageStorageKey = 'jabs.language';
const legacyLanguageStorageKey = 'bracketier.language';

export function normalizeLocale(value: string | null | undefined): SupportedLocale | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es-419';
  return undefined;
}

export function resolveInitialLocale(): SupportedLocale {
  let stored: SupportedLocale | undefined;
  try {
    stored = normalizeLocale(
      window.localStorage.getItem(languageStorageKey)
        ?? window.localStorage.getItem(legacyLanguageStorageKey)
    );
    if (stored && !window.localStorage.getItem(languageStorageKey)) {
      window.localStorage.setItem(languageStorageKey, stored);
    }
  } catch {
    stored = undefined;
  }
  if (stored) return stored;
  return normalizeLocale(window.navigator.languages?.[0] ?? window.navigator.language) ?? 'en';
}

export const i18n = createInstance();

let initialization: Promise<unknown> | undefined;

export function initializeI18n(): Promise<unknown> {
  if (initialization) return initialization;
  const initialLocale = resolveInitialLocale();
  initialization = i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLocale,
      fallbackLng: 'en',
      supportedLngs: supportedLocales,
      defaultNS: 'common',
      fallbackNS: 'common',
      interpolation: { escapeValue: false },
      returnNull: false,
      react: { useSuspense: false }
    })
    .then((result) => {
      document.documentElement.lang = initialLocale;
      return result;
    });
  return initialization;
}

export async function setLocale(locale: SupportedLocale): Promise<void> {
  try {
    window.localStorage.setItem(languageStorageKey, locale);
  } catch {
    // A restricted browser context may deny storage; the in-memory selection still applies.
  }
  document.documentElement.lang = locale;
  await i18n.changeLanguage(locale);
}
