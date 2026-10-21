import { Checkbox, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { CustomScoreboard } from '@shared/customScoreboards';
import type { SelectedSetState } from '@shared/models';
import { BufferedTextInput } from './BufferedTextInput';

type Broadcast = NonNullable<SelectedSetState['broadcast']>;
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
    <Paper className="operator-inset" p="sm" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={700}>{t('quickTools.broadcastExtras')}</Text>
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
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {(['infoLeft', 'infoCenter', 'infoRight'] as const).map((rail, index) => (
            <Stack gap="xs" key={rail}>
              <Checkbox
                label={t(
                  index === 0 ? 'quickTools.leftRail' : index === 1 ? 'quickTools.centerRail' : 'quickTools.rightRail'
                )}
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
              {rail !== 'infoCenter' && (
                <BufferedTextInput
                  aria-label={t(rail === 'infoLeft' ? 'broadcast.leftRail' : 'broadcast.rightRail')}
                  value={broadcast?.[rail] ?? ''}
                  disabled={!onBroadcastChange}
                  onCommit={(value) => onBroadcastChange?.({ [rail]: value || undefined })}
                />
              )}
            </Stack>
          ))}
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          {t('quickTools.railsHelp')}
        </Text>
      </Stack>
    </Paper>
  );
}
