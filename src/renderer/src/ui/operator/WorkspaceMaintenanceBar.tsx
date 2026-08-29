import { Button, Group, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { StartggSetScope } from '@shared/models';
import { ModerationAllowlistControls } from './ModerationAllowlistControls';

type WorkspaceMaintenanceBarProps = {
  loading: boolean;
  reloadingAssets: boolean;
  reloadSelectedSetDisabled: boolean;
  setScope?: StartggSetScope;
  onReloadAssets(): void;
  onReloadBracketData(scope: StartggSetScope): void;
  onReloadSelectedSet(): void;
  onClearCache(): void;
};

export function WorkspaceMaintenanceBar({
  loading,
  reloadingAssets,
  reloadSelectedSetDisabled,
  setScope,
  onReloadAssets,
  onReloadBracketData,
  onReloadSelectedSet,
  onClearCache
}: WorkspaceMaintenanceBarProps) {
  const { t } = useTranslation('operator');

  return (
    <Group className="workspace-maintenance-bar" gap="xs" wrap="nowrap">
      <ModerationAllowlistControls />
      <Tooltip label={t('browser.reloadAssetsHint')} openDelay={350}>
        <span>
          <Button size="compact-xs" variant="default" loading={reloadingAssets} onClick={onReloadAssets}>
            {t('browser.reloadAssets')}
          </Button>
        </span>
      </Tooltip>
      <Tooltip label={t('browser.refreshHint')} openDelay={350}>
        <span>
          <Button
            size="compact-xs"
            variant="default"
            disabled={loading || !setScope}
            onClick={() => setScope && onReloadBracketData(setScope)}
          >
            {t('browser.refresh')}
          </Button>
        </span>
      </Tooltip>
      <Tooltip label={t('editor.reloadHint')} openDelay={350}>
        <span>
          <Button
            size="compact-xs"
            variant="default"
            disabled={reloadSelectedSetDisabled}
            onClick={onReloadSelectedSet}
          >
            {t('editor.reload')}
          </Button>
        </span>
      </Tooltip>
      <Tooltip label={t('startgg.clearCacheHint')} openDelay={350}>
        <span>
          <Button
            data-testid="clear-startgg-cache"
            size="compact-xs"
            variant="subtle"
            color="red"
            disabled={loading}
            onClick={onClearCache}
          >
            {t('startgg.clearCache')}
          </Button>
        </span>
      </Tooltip>
    </Group>
  );
}
