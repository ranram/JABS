import translations from './nativeErrors.es-419.json';
import { i18n } from './index';

// Native services keep their diagnostic messages in English. Translate at the
// shared display boundary, including legacy messages without a stable error code.
const spanish: Record<string, string> = translations;
const topEightCodes = [
  'topEightMatchups.serializeFailed',
  'topEightMatchups.unavailable',
  'topEightMatchups.invalidStyling',
  'topEightMatchups.invalidCatalog',
  'topEightMatchups.invalidTournamentName',
  'topEightMatchups.invalidMatchupCount',
  'topEightMatchups.invalidBracketOrder',
  'topEightMatchups.invalidPlayerName',
  'topEightMatchups.blockedCharacter',
  'topEightMatchups.blockedTournamentName',
  'topEightMatchups.blockedEventName',
  'topEightMatchups.blockedPlayerName',
  'topEightMatchups.blockedSponsor'
] as const;
const slots = /\{(\w*)\}/g;
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.entries(spanish).flatMap(([source, translated]) => {
  const names = [...source.matchAll(slots)].map((match) => match[1]);
  if (!names.length) return [];
  const pattern = source
    .split(slots)
    .filter((_, index) => index % 2 === 0)
    .map(escapePattern)
    .join('(.+?)');
  return [{ pattern: new RegExp(`^${pattern}$`, 's'), names, translated }];
});

export function localizedNativeError(error: unknown, fallback?: string): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  const defaultMessage = fallback ?? i18n.t('errors:nativeFailure');
  if (!message) return defaultMessage;
  const [code, argument] = message.split('|');
  if (code === 'moderation.lineTooLong' || code === 'moderation.protectedEntry') {
    return i18n.t(`operator:${code}`, { line: argument });
  }
  if (code === 'moderation.fileTooLarge' || code === 'moderation.tooManyEntries') {
    return i18n.t(`operator:${code}`);
  }
  const topEightCode = topEightCodes.find((key) => key === code);
  if (topEightCode) return i18n.t(`operator:${topEightCode}`);
  if (!(i18n.resolvedLanguage ?? i18n.language ?? 'en').startsWith('es')) return message;
  if (Object.hasOwn(spanish, message)) return spanish[message];
  for (const { pattern, names, translated } of templates) {
    const match = pattern.exec(message);
    if (!match) continue;
    let index = 0;
    return translated.replace(slots, () => {
      const value = match[++index];
      if (names[index - 1] === 'error') return localizedNativeError(value);
      return value
        .split(', ')
        .map((part) => (Object.hasOwn(spanish, part) ? spanish[part] : part))
        .join(', ');
    });
  }
  // Do not leak an English transport/OS message into Spanish controls.
  return defaultMessage;
}
