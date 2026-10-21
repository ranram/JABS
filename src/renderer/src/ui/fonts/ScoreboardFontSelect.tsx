import { Select, Text } from '@mantine/core';
import { bundledFontIds, type BundledFontId } from '@shared/fonts';
import { bundledFonts } from './bundledFonts';

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
  value?: BundledFontId;
  includeDefault?: boolean;
  disabled?: boolean;
  onChange(font?: BundledFontId): void;
}) {
  const choices: Array<{ value: string; label: string }> = bundledFontIds.map((id) => ({
    value: id,
    label: bundledFonts[id].label
  }));
  if (includeDefault) choices.unshift({ value: 'default', label: '[DEFAULT]' });
  return (
    <Select
      label={label}
      description={description}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      value={value ?? 'default'}
      data={choices}
      disabled={disabled}
      allowDeselect={false}
      renderOption={({ option }) => (
        <Text style={{ fontFamily: bundledFonts[option.value as BundledFontId]?.family }}>{option.label}</Text>
      )}
      onChange={(id) => {
        if (id === 'default' && includeDefault) onChange(undefined);
        else {
          const font = bundledFontIds.find((font) => font === id);
          if (font) onChange(font);
        }
      }}
    />
  );
}
