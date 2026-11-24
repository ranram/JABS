import { Select, Text } from '@mantine/core';
import { bundledFontIds, isImportedFont, scoreboardFontSchema, type ScoreboardFontId } from '@shared/fonts';
import { useTranslation } from 'react-i18next';
import { useAppearance } from '../appearance/AppearanceProvider';
import { bundledFonts } from './bundledFonts';
import { useImportedFonts, useScoreboardFontFamily } from './useScoreboardFont';

export function ScoreboardFontSelect({
  label,
  description,
  value,
  includeDefault = false,
  disabled = false,
  onChange
}: {
  label: string;
  description?: string;
  value?: ScoreboardFontId;
  includeDefault?: boolean;
  disabled?: boolean;
  onChange(font?: ScoreboardFontId): void;
}) {
  const { t } = useTranslation('operator');
  const { state } = useAppearance();
  const showImportedFonts = state.showImportedFonts === true;
  const imported = useImportedFonts(showImportedFonts || isImportedFont(value));
  const selectedFamily = useScoreboardFontFamily(value);
  const choices: Array<{ value: string; label: string }> = bundledFontIds.map((id) => ({
    value: id,
    label: bundledFonts[id].label
  }));
  for (const font of imported.filter((font) => showImportedFonts || font.id === value)
    .sort((a, b) => a.name.localeCompare(b.name))) {
    choices.push({ value: font.id, label: font.name });
  }
  if (isImportedFont(value) && !choices.some((choice) => choice.value === value)) {
    choices.push({ value, label: t('appearance.importedFont') });
  }
  if (includeDefault) choices.unshift({ value: 'default', label: '[DEFAULT]' });
  return (
    <Select
      label={label}
      description={description}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      value={value ?? 'default'}
      data={choices}
      searchable={showImportedFonts}
      disabled={disabled}
      allowDeselect={false}
      renderOption={({ option }) => {
        const parsed = scoreboardFontSchema.safeParse(option.value);
        const font = parsed.data;
        const family = font && !isImportedFont(font) ? bundledFonts[font].family
          : font === value ? selectedFamily : undefined;
        return <Text style={{ fontFamily: family }}>{option.label}</Text>;
      }}
      onChange={(id) => {
        if (id === 'default' && includeDefault) onChange(undefined);
        else {
          const font = scoreboardFontSchema.safeParse(id);
          if (font.success) onChange(font.data);
        }
      }}
    />
  );
}
