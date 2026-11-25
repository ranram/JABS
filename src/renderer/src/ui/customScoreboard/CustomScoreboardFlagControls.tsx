import { Checkbox, Group, Slider, Stack, Text } from '@mantine/core';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  customScoreboardRegionBounds,
  clampCustomScoreboardRegion,
  customScoreboardSlantedFlagRatio,
  maxCustomScoreboardFlagSlant,
  type CustomScoreboardRegion,
  type CustomScoreboardRegionId
} from '@shared/customScoreboards';

type Props = {
  regionId: CustomScoreboardRegionId;
  region: CustomScoreboardRegion;
  onChange(patch: Partial<CustomScoreboardRegion>): void;
};

export function CustomScoreboardFlagControls({ regionId, region, onChange }: Props) {
  const { t } = useTranslation('operator');
  const sizing = useRef({ ratio: region.width / region.height, width: region.width, height: region.height });
  // Keep the aspect ratio stable through rounded slider updates; manual W/H edits set a new ratio.
  if (region.width !== sizing.current.width || region.height !== sizing.current.height) {
    sizing.current = { ratio: region.width / region.height, width: region.width, height: region.height };
  }
  const ratio = region.flagSlant ? customScoreboardSlantedFlagRatio : sizing.current.ratio
  const bounds = customScoreboardRegionBounds(regionId);
  const minimum = Math.max(20, Math.ceil(20 / ratio));
  const maximum = Math.min(bounds.height, Math.floor(bounds.width / ratio));
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm">{t('customScoreboard.flagSize')}</Text>
        <Text size="xs" c="dimmed">
          {region.width} × {region.height} px
        </Text>
      </Group>
      <Slider
        disabled={minimum >= maximum}
        min={minimum}
        max={maximum}
        step={1}
        value={region.height}
        thumbLabel={t('customScoreboard.flagSize')}
        label={(height) => `${Math.round(height * ratio)} × ${height} px`}
        onChange={(height) => {
          const width = Math.max(20, Math.min(bounds.width, Math.round(height * ratio)));
          sizing.current.width = width;
          sizing.current.height = height;
          onChange(
            clampCustomScoreboardRegion(regionId, {
              ...region,
              width,
              height,
              x: Math.round(region.x + (region.width - width) / 2),
              y: Math.round(region.y + (region.height - height) / 2)
            })
          );
        }}
      />
      <Group justify="space-between">
        <Text size="sm">{t('customScoreboard.flagSlant')}</Text>
        <Text size="xs" c="dimmed">{region.flagSlant ?? 0}%</Text>
      </Group>
      <Slider
        min={0}
        max={maxCustomScoreboardFlagSlant}
        value={region.flagSlant ?? 0}
        thumbLabel={t('customScoreboard.flagSlant')}
        label={(slant) => `${slant}%`}
        onChange={(flagSlant) => onChange({ flagSlant: flagSlant || undefined })}
      />
      <Checkbox
        label={t('customScoreboard.clipFlagToFrame')}
        description={t('customScoreboard.clipFlagHelp')}
        checked={region.clipFlagToFrame ?? false}
        onChange={(event) => onChange({ clipFlagToFrame: event.currentTarget.checked || undefined })}
      />
    </Stack>
  );
}
