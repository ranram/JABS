import { en } from './catalogs/en';
import { es419 } from './catalogs/es-419';

export const supportedLocales = ['en', 'es-419'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const resources = {
  en,
  'es-419': es419
} as const;
