import { Anchor, Badge, Button, Group, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { OperatorIcon, DownloadSimpleIcon } from '../icons';
import './generatorLayout.css';

export function GeneratorNavigation({
  detailsId,
  previewId,
  onDownload,
  exporting,
  previewLoading,
  reason
}: {
  detailsId: string;
  previewId: string;
  onDownload(): void;
  exporting: boolean;
  previewLoading: boolean;
  reason?: string;
}) {
  const { t } = useTranslation('operator');
  const readinessLabel = previewLoading
    ? t('quickTools.loadingPreview')
    : reason
      ? t('generators.needsDetails')
      : t('generators.ready');
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
      <Group gap="sm" className="generator-export-actions">
        <Badge variant="light" color={reason ? 'yellow' : 'green'} tt="none">
          {readinessLabel}
        </Badge>
        <Tooltip label={reason} disabled={!reason} events={{ hover: true, focus: true, touch: true }}>
          <span tabIndex={reason ? 0 : undefined}>
            <Button
              size="compact-sm"
              disabled={Boolean(reason)}
              loading={exporting}
              onClick={onDownload}
              leftSection={<OperatorIcon icon={DownloadSimpleIcon} />}
            >
              {t('quickTools.download')}
            </Button>
          </span>
        </Tooltip>
      </Group>
    </Group>
  );
}
