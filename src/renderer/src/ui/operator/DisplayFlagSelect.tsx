import { Group, Select, Text } from '@mantine/core';
import type { CountryOption } from '@shared/models';
import { prideFlags } from '@shared/prideFlags';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { displayFlagUrl } from '../overlayPlayerPresentation';
import { sortByLabel } from './operatorUtils';

type DisplayFlagSelection = {
  country?: string;
  displayFlag?: string;
};

type DisplayFlagSelectProps = {
  countries: CountryOption[];
  country?: string;
  displayFlag?: string;
  label: string;
  placeholder: string;
  testId?: string;
  onChange(selection: DisplayFlagSelection): void;
};

const countryValuePrefix = 'country:';

export function DisplayFlagSelect({
  countries,
  country,
  displayFlag,
  label,
  placeholder,
  testId,
  onChange
}: DisplayFlagSelectProps) {
  const { t, i18n } = useTranslation('operator');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const data = useMemo(() => [
    ...sortByLabel(countries, (option) => option.name, locale).map((option) => ({
      value: `${countryValuePrefix}${option.code}`,
      label: `${option.name} · ${option.code}`
    })),
    ...sortByLabel(prideFlags, (option) => option.label, locale).map((option) => ({
      value: option.id,
      label: `Pride: ${option.label}`
    }))
  ], [countries, locale]);

  const value = displayFlag ?? (country ? `${countryValuePrefix}${country}` : null);
  const selectedFlagUrl = displayFlagUrl(country, displayFlag);

  return (
    <Select
      searchable
      clearable
      data-testid={testId}
      label={label}
      placeholder={placeholder}
      nothingFoundMessage={t('selector.none')}
      data={data}
      value={value}
      leftSection={selectedFlagUrl ? (
        <FlagPreview src={selectedFlagUrl} />
      ) : undefined}
      renderOption={({ option }) => {
        const pride = option.value.startsWith('pride:');
        const optionCountry = option.value.startsWith(countryValuePrefix)
          ? option.value.slice(countryValuePrefix.length)
          : undefined;
        const url = displayFlagUrl(optionCountry, pride ? option.value : undefined);
        return (
          <Group gap="sm" wrap="nowrap">
            {url && <FlagPreview src={url} />}
            <Text size="sm">{option.label}</Text>
          </Group>
        );
      }}
      onChange={(next) => {
        if (!next) {
          onChange(displayFlag
            ? { country, displayFlag: undefined }
            : { country: undefined, displayFlag: undefined });
          return;
        }
        if (next.startsWith(countryValuePrefix)) {
          onChange({
            country: next.slice(countryValuePrefix.length),
            displayFlag: undefined
          });
          return;
        }
        onChange({ country, displayFlag: next });
      }}
    />
  );
}

function FlagPreview({ src }: { src: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        flex: '0 0 22px',
        height: 16,
        justifyContent: 'center',
        width: 22
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          display: 'block',
          height: 16,
          objectFit: 'contain',
          width: 22
        }}
      />
    </span>
  );
}
