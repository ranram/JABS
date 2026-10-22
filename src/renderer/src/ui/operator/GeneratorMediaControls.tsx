import { Button, Group, Select, SimpleGrid, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { MediaLayerKind } from '@shared/mediaPlacement';
import { MediaControlHint } from './MediaControlHint';

type MediaSelection = { index: number; layer: MediaLayerKind };
type GeneratorMediaControlsProps = {
  options: Array<{ value: string; label: string }>;
  selection?: MediaSelection;
  label: string;
  resetLabel: string;
  onSelect(selection?: MediaSelection): void;
  onReset(): void;
};

const noSelection = '__none__';

export function GeneratorMediaControls({
  options,
  selection,
  label,
  resetLabel,
  onSelect,
  onReset
}: GeneratorMediaControlsProps) {
  const { t } = useTranslation('common');
  if (!options.length) return null;

  function select(value: string | null) {
    if (!value || value === noSelection) return onSelect(undefined);
    if (!options.some((option) => option.value === value)) return;
    const [index, layer] = value.split(':');
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || (layer !== 'photo' && layer !== 'character')) return;
    onSelect({ index: position, layer });
  }

  return (
    <Stack gap="xs" mb="md">
      <SimpleGrid spacing="sm" type="container" cols={{ base: 1, '34rem': 2 }}>
        <Select
          label={label}
          value={selection ? `${selection.index}:${selection.layer}` : noSelection}
          placeholder={t('actions.select')}
          clearable
          data={[{ value: noSelection, label: t('actions.select') }, ...options]}
          onChange={select}
        />
        <Group align="flex-end">
          <Button fullWidth variant="default" disabled={!selection} onClick={onReset}>
            {resetLabel}
          </Button>
        </Group>
      </SimpleGrid>
      <MediaControlHint showOverlapSelection />
    </Stack>
  );
}
