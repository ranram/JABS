import { Button, Group, Text, Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SettingsButton } from '../appearance/SettingsPanel';
import { AssetsMenu } from './AssetsMenu';
import type { SelectedSetState, StartggSetScope } from '@shared/models';
import { ModerationAllowlistControls } from './ModerationAllowlistControls';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import { OverlayUrlMenu } from './OverlayUrlMenu';
import { StingerQuickMenu } from '../stingers/StingerQuickMenu';
import { HelpMenu } from '../tutorials/HelpMenu';
import type { TutorialWorkspace } from '../tutorials/tutorials';
import { OperatorIcon, WrenchIcon, ArrowsClockwiseIcon, TrashSimpleIcon, SignOutIcon } from '../icons';
import { MatchesMenu } from './MatchesMenu';
import './workspaceMaintenance.css';

type WorkspaceMaintenanceBarProps = {
  activeSet?: SelectedSetState;
  assetCatalogSlug?: string;
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
  onConfigureStingers(): void;
  onTutorialWorkspace(workspace: TutorialWorkspace): void;
  onOpenSetSelector(): void;
  setSelectorDisabled: boolean;
};

export function WorkspaceMaintenanceBar({
  activeSet,
  assetCatalogSlug,
  keyboardShortcuts,
  reloadWarning,
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
  onCopy,
  onConfigureStingers,
  onTutorialWorkspace,
  onOpenSetSelector,
  setSelectorDisabled
}: WorkspaceMaintenanceBarProps) {
  const { t } = useTranslation('operator');
  const bracketActions: Array<{
    id: string;
    label: string;
    disabled: boolean;
    help?: string;
    testId?: string;
    onClick(): void;
    icon: typeof ArrowsClockwiseIcon;
  }> = [
    {
      id: 'clear',
      icon: TrashSimpleIcon,
      label: t('startgg.clearCache'),
      disabled: loading,
      testId: 'clear-startgg-cache',
      onClick: onClearCache
    },
    {
      id: 'reload',
      icon: ArrowsClockwiseIcon,
      label: t('editor.reload'),
      disabled: reloadSelectedSetDisabled,
      help: reloadWarning ?? t(loading ? 'editor.waitAction' : 'editor.reloadHint'),
      onClick: onReloadSelectedSet
    },
    {
      id: 'refresh',
      icon: ArrowsClockwiseIcon,
      label: t('browser.refresh'),
      disabled: loading || !setScope,
      help: t(loading ? 'editor.waitAction' : 'browser.selectEvent'),
      onClick: () => setScope && onReloadBracketData(setScope)
    }
  ];
  if (tournamentLoaded)
    bracketActions.push({
      id: 'unload',
      icon: SignOutIcon,
      label: t('startgg.unloadTournament'),
      disabled: unloadTournamentDisabled,
      testId: 'unload-tournament',
      onClick: onUnloadTournament
    });
  return (
    <div className="workspace-maintenance-container">
      <Group className="workspace-maintenance-bar">
        <div className="workspace-maintenance-group workspace-maintenance-bracket" data-tutorial="bracket-options">
          <Menu position="bottom-start" shadow="md" width={280}>
            <Menu.Target>
              <Button
                size="compact-xs"
                variant="default"
                leftSection={<OperatorIcon icon={WrenchIcon} size={14} />}
                rightSection={<span aria-hidden="true">▾</span>}
              >
                {t('utilityGroups.bracket')}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {bracketActions.map((action) => (
                <Menu.Item
                  key={action.id}
                  data-testid={action.testId}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  leftSection={<OperatorIcon icon={action.icon} />}
                >
                  {action.label}
                  {action.disabled && action.help && (
                    <Text size="xs" c="dimmed">
                      {action.help}
                    </Text>
                  )}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>

        <MatchesMenu
          activeSet={activeSet}
          setSelectorDisabled={setSelectorDisabled}
          onOpenSetSelector={onOpenSetSelector}
        />

        <div className="workspace-maintenance-group workspace-maintenance-media" data-tutorial="assets">
          <AssetsMenu game={assetCatalogSlug} reloading={reloadingAssets} onReload={onReloadAssets} />
        </div>

        <div className="workspace-maintenance-group workspace-maintenance-moderation">
          <ModerationAllowlistControls onApplied={onModerationApplied} />
        </div>

        <div
          className="workspace-maintenance-group workspace-maintenance-obs"
          data-tutorial="obs"
          role="group"
          aria-label="OBS"
        >
          <OverlayUrlMenu copied={copiedHandoff} disabled={!localBaseUrl} compact onCopy={onCopy} />
          <StingerQuickMenu activeSet={activeSet} onConfigure={onConfigureStingers} />
        </div>

        <div className="workspace-maintenance-group workspace-maintenance-preferences">
          <SettingsButton compact keyboardShortcuts={keyboardShortcuts} />
          <HelpMenu navigate={onTutorialWorkspace} />
        </div>
      </Group>
    </div>
  );
}
