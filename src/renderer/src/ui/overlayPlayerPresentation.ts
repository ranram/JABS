import { prideFlagDefinition } from '@shared/prideFlags';
import noFlag from '../assets/Flag_of_None.webp';
import type { PlayerState } from '@shared/models';

export function sponsorLine(player: Pick<PlayerState, 'prefix' | 'sponsor'>): string {
  return [...new Set([player.prefix, player.sponsor].filter((value): value is string => Boolean(value)))].join(' · ');
}

const bundledFlagUrls = import.meta.glob<string>(
  '../../../../node_modules/flag-icons/flags/4x3/*.svg',
  { eager: true, import: 'default', query: '?url' }
);

const bundledPrideFlagUrls = import.meta.glob<string>(
  '../../../../flags/pride/*.svg',
  { eager: true, import: 'default', query: '?url' }
);

export function countryFlagUrl(countryCode: string | undefined): string | undefined {
  const normalized = countryCode?.trim().toLowerCase();
  if (!normalized || !/^[a-z]{2}$/.test(normalized)) return undefined;
  return bundledFlagUrls[`../../../../node_modules/flag-icons/flags/4x3/${normalized}.svg`];
}

export function displayFlagUrl(
  countryCode: string | undefined,
  displayFlag: string | undefined
): string {
  const definition = prideFlagDefinition(displayFlag);
  if (definition) {
    return bundledPrideFlagUrls[`../../../../flags/pride/${definition.file}`] ?? noFlag;
  }
  return countryFlagUrl(countryCode) ?? noFlag;
}

export function displayFlagLabel(
  countryCode: string | undefined,
  displayFlag: string | undefined
): string | undefined {
  const definition = prideFlagDefinition(displayFlag);
  if (definition) return `Pride: ${definition.label}`;
  const country = countryCode?.trim().toUpperCase();
  return country && countryFlagUrl(country) ? country : 'No flag selected';
}

export function isPrideDisplayFlag(displayFlag: string | undefined): boolean {
  return Boolean(prideFlagDefinition(displayFlag));
}
