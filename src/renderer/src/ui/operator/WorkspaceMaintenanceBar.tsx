import { Button, Group, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { StartggSetScope } from '@shared/models';
import { ModerationAllowlistControls } from './ModerationAllowlistControls';

type WorkspaceMaintenanceBarProps = {
  loading: boolean;
  reloadingAssets: boolean;
  reloadSelectedSetDisabled: boolean;
  unloadTournamentDisabled: boolean;
  tournamentLoaded: boolean;
  setScope?: StartggSetScope;
  onReloadAssets(): void;
  onReloadBracketData(scope: StartggSetScope): void;
  onReloadSelectedSet(): void;
  onUnloadTournament(): void;
  onClearCache(): void;
  onModerationApplied(): void;
};

export function WorkspaceMaintenanceBar({
  loading,
  reloadingAssets,
  reloadSelectedSetDisabled,
  unloadTournamentDisabled,
  tournamentLoaded,
  setScope,
  onReloadAssets,
  onReloadBracketData,
  onReloadSelectedSet,
  onUnloadTournament,
  onClearCache,
  onModerationApplied
}: WorkspaceMaintenanceBarProps) {
  const { t } = useTranslation('operator');

  return (
    <Group className="workspace-maintenance-bar" gap="md" align="flex-end" wrap="nowrap">
      <div className="workspace-maintenance-group">
        <Text className="workspace-maintenance-label">{t('utilityGroups.bracket')}</Text>
        <Group className="workspace-maintenance-actions" gap="xs" wrap="nowrap">
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
          {tournamentLoaded && (
            <Tooltip label={t('startgg.unloadTournamentHint')} openDelay={350}>
              <span>
                <Button
                  data-testid="unload-tournament"
                  size="compact-xs"
                  variant="default"
                  disabled={unloadTournamentDisabled}
                  onClick={onUnloadTournament}
                >
                  {t('startgg.unloadTournament')}
                </Button>
              </span>
            </Tooltip>
          )}
          <Tooltip label={t('startgg.clearCacheHint')} openDelay={350}>
            <span>
              <Button
                data-testid="clear-startgg-cache"
                size="compact-xs"
                variant="default"
                disabled={loading}
                onClick={onClearCache}
              >
                {t('startgg.clearCache')}
              </Button>
            </span>
          </Tooltip>
        </Group>
      </div>
      <div className="workspace-maintenance-group">
        <Text className="workspace-maintenance-label">{t('utilityGroups.media')}</Text>
        <Group className="workspace-maintenance-actions" gap="xs" wrap="nowrap">
          <Tooltip label={t('browser.reloadAssetsHint')} openDelay={350}>
            <span>
              <Button size="compact-xs" variant="default" loading={reloadingAssets} onClick={onReloadAssets}>
                {t('browser.reloadAssets')}
              </Button>
            </span>
          </Tooltip>
        </Group>
      </div>
      <div className="workspace-maintenance-group">
        <Text className="workspace-maintenance-label">{t('utilityGroups.moderation')}</Text>
        <ModerationAllowlistControls onApplied={onModerationApplied} />
      </div>
    </Group>
  );
}
