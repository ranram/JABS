import type { PlayerState } from '@shared/models';
import { prideFlagDefinition } from '@shared/prideFlags';

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
): string | undefined {
  const definition = prideFlagDefinition(displayFlag);
  if (definition) {
    return bundledPrideFlagUrls[`../../../../flags/pride/${definition.file}`];
  }
  return countryFlagUrl(countryCode);
}

export function displayFlagLabel(
  countryCode: string | undefined,
  displayFlag: string | undefined
): string | undefined {
  const definition = prideFlagDefinition(displayFlag);
  return definition ? `Pride: ${definition.label}` : countryCode?.toUpperCase();
}

export function isPrideDisplayFlag(displayFlag: string | undefined): boolean {
  return Boolean(prideFlagDefinition(displayFlag));
}

export function overlayPlayerDetails(player: PlayerState, seedLabel?: string): string {
  return [player.state, seedLabel]
    .filter((detail): detail is string => Boolean(detail))
    .join(' · ');
}
