import { useMemo } from 'react';
import { Select } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { LogoAsset } from '@shared/models';
import { sortByLabel } from './operatorUtils';

export function OverlayLogoSelect({ logos, assetId, disabled, onChange }: {
  logos: LogoAsset[];
  assetId?: string;
  disabled?: boolean;
  onChange(assetId?: string): void;
}) {
  const { t, i18n } = useTranslation('operator');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const options = useMemo(() => {
    const available = sortByLabel(logos, (logo) => logo.label, locale)
      .map((logo) => ({ value: logo.id, label: logo.label }));
    if (assetId && !logos.some(({ id }) => id === assetId)) {
      available.push({ value: assetId, label: t('broadcast.unavailableLogo', { logo: assetId }) });
    }
    return available;
  }, [logos, assetId, locale, t]);
  return (
    <Select
      label={t('broadcast.logo')}
      placeholder={t('broadcast.useRailsLogo')}
      value={assetId ?? null}
      data={options}
      searchable
      clearable
      clearButtonProps={{ 'aria-label': t('broadcast.useRailsLogo') }}
      disabled={disabled}
      onChange={(value) => onChange(value ?? undefined)}
    />
  );
}
