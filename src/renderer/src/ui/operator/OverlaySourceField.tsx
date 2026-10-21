import { Button, Code, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { copyOverlayUrl, localOverlayUrl, type LocalHandoffUrl } from '../../desktopRuntime';

export function OverlaySourceField({
  localBaseUrl,
  source
}: {
  localBaseUrl: string;
  source: Exclude<LocalHandoffUrl, 'champion'>;
}) {
  const { t } = useTranslation(['operator', 'common']);
  const label = t(`live.overlayNames.${source}`);
  async function copy() {
    try {
      await copyOverlayUrl(localBaseUrl, source);
      notifications.show({ message: t('live.copiedOverlay', { overlay: label }), color: 'green' });
    } catch {
      notifications.show({ message: t('messages.copyFailed'), color: 'red' });
    }
  }
  return (
    <Group gap="xs" wrap="nowrap">
      <Code className="workspace-obs-url" style={{ flex: 1, minWidth: 0 }} block>
        {localOverlayUrl(localBaseUrl, source)}
      </Code>
      <Button
        size="sm"
        variant="default"
        style={{ flexShrink: 0 }}
        aria-label={`${t('live.copyObs')}: ${label}`}
        onClick={() => void copy()}
      >
        {t('common:actions.copy')}
      </Button>
    </Group>
  );
}
