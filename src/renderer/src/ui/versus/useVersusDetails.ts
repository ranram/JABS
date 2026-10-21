import { useTranslation } from 'react-i18next';
import type { SelectedSetState } from '@shared/models';
import type { VersusScreenState, VersusStat } from '@shared/versusScreen';
import type { VersusProfile } from './useVersusProfiles';

export type VersusDetail = { id: VersusStat; label: string; values: [string, string] };

/** One selection/order feeds both the comparison table and its border tickers. */
export function useVersusDetails(
  set: SelectedSetState,
  settings: VersusScreenState,
  profiles: VersusProfile[],
  tournament?: string
) {
  const { t, i18n } = useTranslation('overlay');
  const players = [set.playerOne, set.playerTwo];
  const selected = settings.statRows.filter(
    (row) =>
      (row !== 'seed' || Boolean(set.setId)) &&
      (row !== 'nickname' || (profiles.length === 2 && profiles.every((profile) => profile.nickname?.trim())))
  );
  function value(row: VersusStat, index: number): string | undefined {
    const player = players[index];
    switch (row) {
      case 'age':
        return profiles[index]?.age?.toString();
      case 'sponsor':
        return player.prefix?.trim() || player.sponsor?.trim() || undefined;
      case 'seed':
        return set.eventId && player.seed ? player.seed.toString() : undefined;
      case 'nickname':
        return profiles[index]?.nickname?.trim() || undefined;
    }
  }
  const rows: VersusDetail[] = selected.map((id) => ({
    id,
    label: t(`versus.stats.${id}`),
    values: [value(id, 0) ?? '—', value(id, 1) ?? '—']
  }));
  const tickers = players.map((player, index) => {
    const country = countryName(player.country, i18n.resolvedLanguage ?? i18n.language);
    return [
      tournament?.trim() || undefined,
      country ? t('versus.location', { country }) : undefined,
      ...rows.map((row) => {
        const detail = value(row.id, index);
        if (!detail) return undefined;
        return row.id === 'sponsor' ? t('versus.representing', { sponsor: detail }) : `${row.label} ${detail}`;
      })
    ]
      .filter(Boolean)
      .join(' · ');
  }) as [string, string];
  return { rows, tickers };
}

function countryName(code: string | undefined, locale: string): string | undefined {
  const region = code?.trim().toUpperCase();
  if (!region || !/^[A-Z]{2}$/.test(region)) return undefined;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' }).of(region);
    return name === region ? undefined : name;
  } catch {
    return undefined;
  }
}
