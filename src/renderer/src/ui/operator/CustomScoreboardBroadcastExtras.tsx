import { Checkbox, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { CustomScoreboard } from '@shared/customScoreboards';
import type { SelectedSetState } from '@shared/models';
import { BufferedTextInput } from './BufferedTextInput';

type Broadcast = NonNullable<SelectedSetState['broadcast']>;

const railControls = [
  { rail: 'infoLeft', label: 'quickTools.leftRail' },
  { rail: 'infoCenter', label: 'quickTools.centerRail' },
  { rail: 'infoRight', label: 'quickTools.rightRail' }
] as const;

export function CustomScoreboardBroadcastExtras({
  scoreboard,
  onChange,
  broadcast,
  onBroadcastChange
}: {
  scoreboard: CustomScoreboard;
  onChange(value: CustomScoreboard): void;
  broadcast?: Broadcast;
  onBroadcastChange?(patch: Partial<Broadcast>): void;
}) {
  const { t } = useTranslation('operator');
  return (
    <Stack gap="md">
      <Text size="sm" fw={600}>
        {t('quickTools.broadcastExtras')}
      </Text>
      <SimpleGrid type="container" cols={{ base: 1, '30rem': 2 }} spacing="md">
        {(['infoLeft', 'infoRight'] as const).map((rail) => (
          <BufferedTextInput
            key={rail}
            label={t(rail === 'infoLeft' ? 'broadcast.leftRail' : 'broadcast.rightRail')}
            value={broadcast?.[rail] ?? ''}
            disabled={!onBroadcastChange}
            onCommit={(value) => onBroadcastChange?.({ [rail]: value || undefined })}
          />
        ))}
      </SimpleGrid>
      <SimpleGrid type="container" cols={{ base: 1, '30rem': 3 }} spacing="md">
        {railControls.map(({ rail, label }) => (
          <Checkbox
            key={rail}
            label={t(label)}
            checked={scoreboard.visibility.bottomRails && scoreboard.visibility[rail]}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              onChange({
                ...scoreboard,
                visibility: {
                  ...scoreboard.visibility,
                  ...(!scoreboard.visibility.bottomRails
                    ? { infoLeft: false, infoCenter: false, infoRight: false }
                    : {}),
                  bottomRails: true,
                  [rail]: enabled
                }
              });
              if (enabled && rail !== 'infoCenter' && !broadcast?.infoBarEnabled)
                onBroadcastChange?.({ infoBarEnabled: true });
            }}
          />
        ))}
      </SimpleGrid>
      <Checkbox
        data-testid="custom-info-bar-enabled"
        label={t('broadcast.showRails')}
        checked={broadcast?.infoBarEnabled ?? false}
        disabled={!onBroadcastChange}
        onChange={(event) => {
          const enabled = event.currentTarget.checked;
          onBroadcastChange?.({ infoBarEnabled: enabled });
          if (enabled && !scoreboard.visibility.bottomRails)
            onChange({ ...scoreboard, visibility: { ...scoreboard.visibility, bottomRails: true } });
        }}
      />
      <Text size="xs" c="dimmed">
        {t('quickTools.railsHelp')}
      </Text>
    </Stack>
  );
}
