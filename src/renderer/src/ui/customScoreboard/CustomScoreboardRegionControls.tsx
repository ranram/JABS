import { Button, NumberInput, Select, SimpleGrid, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  customScoreboardRegionBounds,
  oppositeCustomScoreboardRegionId,
  type CustomScoreboardRegion,
  type CustomScoreboardRegionId
} from '@shared/customScoreboards';
import { CustomScoreboardFlagSizeControl } from './CustomScoreboardFlagSizeControl';

type Props = {
  regionId: CustomScoreboardRegionId;
  region: CustomScoreboardRegion;
  onChange(patch: Partial<CustomScoreboardRegion>): void;
  onMirror(): void;
};

export function CustomScoreboardRegionControls({ regionId, region, onChange, onMirror }: Props) {
  const { t } = useTranslation('operator');
  const mirrorTarget = oppositeCustomScoreboardRegionId(regionId);
  const bounds = customScoreboardRegionBounds(regionId);
  const limits = {
    x: { min: bounds.x, max: bounds.x + bounds.width - region.width },
    y: { min: bounds.y, max: bounds.y + bounds.height - region.height },
    width: { min: 20, max: bounds.x + bounds.width - region.x },
    height: { min: 20, max: bounds.y + bounds.height - region.y }
  };
  return (
    <Stack gap="md">
      <SimpleGrid cols={2}>
        {(['x', 'y', 'width', 'height'] as const).map((field) => (
          <NumberInput
            key={field}
            label={field.toUpperCase()}
            {...limits[field]}
            value={region[field]}
            onChange={(value) => {
              if (typeof value === 'number' && Number.isFinite(value)) onChange({ [field]: Math.round(value) });
            }}
          />
        ))}
        <Select
          style={{ gridColumn: '1 / -1' }}
          label={t('customScoreboard.alignment')}
          value={region.align}
          data={(['left', 'center', 'right'] as const).map((value) => ({
            value,
            label: t(`customScoreboard.align.${value}`)
          }))}
          onChange={(value) => {
            if (value === 'left' || value === 'center' || value === 'right') onChange({ align: value });
          }}
        />
      </SimpleGrid>
      {regionId.endsWith('Flag') && (
        <CustomScoreboardFlagSizeControl key={regionId} regionId={regionId} region={region} onChange={onChange} />
      )}
      {mirrorTarget && (
        <Button variant="light" size="xs" onClick={onMirror}>
          {t('customScoreboard.mirrorToPlayer', { number: mirrorTarget.startsWith('playerOne') ? 1 : 2 })}
        </Button>
      )}
    </Stack>
  );
}
