import { Button, Group, Switch, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { StartggSetScope } from '@shared/models';
import { ModerationAllowlistControls } from './ModerationAllowlistControls';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import { OverlayUrlMenu } from './OverlayUrlMenu';

type WorkspaceMaintenanceBarProps = {
  keyboardShortcuts: { enabled: boolean; setEnabled(value: boolean): void };
  reloadWarning?: string;
  loading: boolean;
  reloadingAssets: boolean;
  reloadSelectedSetDisabled: boolean;
  unloadTournamentDisabled: boolean;
  tournamentLoaded: boolean;
  setScope?: StartggSetScope;
  localBaseUrl?: string;
  copiedHandoff?: LocalHandoffUrl;
  onReloadAssets(): void;
  onReloadBracketData(scope: StartggSetScope): void;
  onReloadSelectedSet(): void;
  onUnloadTournament(): void;
  onClearCache(): void;
  onModerationApplied(): void;
  onCopy(kind: LocalHandoffUrl): void;
};

export function WorkspaceMaintenanceBar({
  keyboardShortcuts, reloadWarning,
  loading,
  reloadingAssets,
  reloadSelectedSetDisabled,
  unloadTournamentDisabled,
  tournamentLoaded,
  setScope,
  localBaseUrl,
  copiedHandoff,
  onReloadAssets,
  onReloadBracketData,
  onReloadSelectedSet,
  onUnloadTournament,
  onClearCache,
  onModerationApplied,
  onCopy
}: WorkspaceMaintenanceBarProps) {
  const { t } = useTranslation('operator');

  return (
    <Group className="workspace-maintenance-bar" gap="md" align="flex-end" wrap="nowrap">
      <div className="workspace-maintenance-group">
        <Text className="workspace-maintenance-label">{t('utilityGroups.bracket')}</Text>
        <Group className="workspace-maintenance-actions" gap="xs" wrap="nowrap">
          <Tooltip label={loading ? t('editor.waitAction') : !setScope ? t('browser.selectEvent') : t('browser.refreshHint')}
            position="bottom" multiline w={260} events={{ hover: true, focus: true, touch: true }} openDelay={350}>
            <span tabIndex={loading || !setScope ? 0 : undefined} role={loading || !setScope ? 'group' : undefined} aria-label={t('browser.refresh')}>
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
          <Tooltip label={reloadWarning ?? (loading ? t('editor.waitAction') : t('editor.reloadHint'))}
            position="bottom" multiline w={260} events={{ hover: true, focus: true, touch: true }} openDelay={350}>
            <span tabIndex={reloadSelectedSetDisabled ? 0 : undefined} role={reloadSelectedSetDisabled ? 'group' : undefined} aria-label={t('editor.reload')}>
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
      <div className="workspace-maintenance-group">
        <Text className="workspace-maintenance-label">{t('utilityGroups.obs')}</Text>
        <OverlayUrlMenu copied={copiedHandoff} disabled={!localBaseUrl} compact onCopy={onCopy} />
      </div>
      <Switch className="workspace-shortcuts-toggle" size="xs" label={t('editor.enableShortcuts')} checked={keyboardShortcuts.enabled}
        onChange={(event) => keyboardShortcuts.setEnabled(event.currentTarget.checked)} />
    </Group>
  );
}
