const englishSuffixes = { one: 'st', two: 'nd', few: 'rd', other: 'th' } as const;
const englishOrdinals = new Intl.PluralRules('en', { type: 'ordinal' });
const spanishSuffixes = ['mo', 'ero', 'do', 'ero', 'to', 'to', 'to', 'mo', 'vo', 'no'];

/** Spanish follows the requested on-air shorthand (1ero, 13vo), not formal 1.º notation. */
export function placementOrdinalSuffix(placement: number, locale: string): string {
  if (locale.toLowerCase().startsWith('es')) {
    const lastTwo = placement % 100;
    return lastTwo >= 11 && lastTwo <= 19 ? 'vo' : spanishSuffixes[placement % 10];
  }
  const category = englishOrdinals.select(placement);
  return englishSuffixes[category as keyof typeof englishSuffixes] ?? 'th';
}
