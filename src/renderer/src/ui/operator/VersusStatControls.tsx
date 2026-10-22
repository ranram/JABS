import { Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { setVersusStatRow, versusStatTypes, type VersusScreenState, type VersusStat } from '@shared/versusScreen';

export function VersusStatControls({
  settings,
  showSeed,
  disabled,
  onChange
}: {
  settings: VersusScreenState;
  showSeed: boolean;
  disabled: boolean;
  onChange(patch: Partial<VersusScreenState>): void;
}) {
  const { t } = useTranslation(['operator', 'overlay']);
  const selected = settings.statRows.filter((row) => showSeed || row !== 'seed');
  const options = [
    { value: 'hidden', label: t('workspaces.versusScreen.hiddenRow') },
    ...versusStatTypes
      .filter((value) => showSeed || value !== 'seed')
      .map((value) => ({ value, label: t(`overlay:versus.stats.${value}`) }))
  ];
  return (
    <Stack gap="sm">
      <Text fw={700}>{t('workspaces.versusScreen.statsHeading')}</Text>
      <Text size="sm" c="dimmed">
        {t('workspaces.versusScreen.statsHelp')}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {Array.from({ length: showSeed ? 4 : 3 }, (_, index) => (
          <Select
            key={index}
            label={t('workspaces.versusScreen.statRow', { number: index + 1 })}
            data={options}
            value={selected[index] ?? 'hidden'}
            disabled={disabled}
            allowDeselect={false}
            onChange={(value) => {
              if (!value) return;
              const statRows = setVersusStatRow(
                selected,
                index,
                value === 'hidden' ? undefined : (value as VersusStat)
              );
              const seedIndex = settings.statRows.indexOf('seed');
              // Exhibition edits retain the hidden tournament row for the next set.
              if (!showSeed && seedIndex !== -1) statRows.splice(Math.min(seedIndex, statRows.length), 0, 'seed');
              onChange({ statRows });
            }}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
