import { MultiSelect, Select, type MultiSelectProps } from '@mantine/core';

type CharacterSelectProps = Pick<
  MultiSelectProps,
  'data' | 'label' | 'description' | 'placeholder' | 'disabled' | 'inputWrapperOrder' | 'searchable' | 'clearable'
> & {
  value: string[];
  maxValues: number;
  'data-testid'?: string;
  onChange(characters: string[]): void;
};

/** Single-character games replace the pick; team games keep an ordered roster. */
export function CharacterSelect({
  value,
  maxValues,
  onChange,
  searchable = true,
  clearable = true,
  ...props
}: CharacterSelectProps) {
  if (maxValues === 1) {
    return (
      <Select
        {...props}
        searchable={searchable}
        clearable={clearable}
        allowDeselect={false}
        value={value[0] ?? null}
        onChange={(character) => onChange(character ? [character] : [])}
      />
    );
  }
  return (
    <MultiSelect
      {...props}
      searchable={searchable}
      clearable={clearable}
      value={value}
      maxValues={maxValues}
      onChange={onChange}
    />
  );
}
