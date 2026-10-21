import { Anchor, Button, Group, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import './generatorLayout.css';

export function GeneratorNavigation({
  detailsId,
  previewId,
  onDownload,
  exporting,
  reason
}: {
  detailsId: string;
  previewId: string;
  onDownload(): void;
  exporting: boolean;
  reason?: string;
}) {
  const { t } = useTranslation('operator');
  return (
    <Group className="generator-navigation" justify="space-between">
      <Group gap="md">
        <Anchor size="sm" fw={600} href={`#${detailsId}`}>
          {t('quickTools.playerDetails')}
        </Anchor>
        <Anchor size="sm" fw={600} href={`#${previewId}`}>
          {t('quickTools.preview')}
        </Anchor>
      </Group>
      <Tooltip label={reason} disabled={!reason} events={{ hover: true, focus: true, touch: true }}>
        <span tabIndex={reason ? 0 : undefined}>
          <Button size="compact-sm" disabled={Boolean(reason)} loading={exporting} onClick={onDownload}>
            {t('quickTools.download')}
          </Button>
        </span>
      </Tooltip>
    </Group>
  );
}
