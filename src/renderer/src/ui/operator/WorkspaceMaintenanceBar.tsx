import { Button, Group, Switch, Text, Tooltip, Menu, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PlayerLibraryButton } from '../players/PlayerLibraryModal';
import { SettingsButton } from '../appearance/SettingsPanel';
import { AssetsMenu } from './AssetsMenu';
import type { SelectedSetState, StartggSetScope } from '@shared/models';
import { ModerationAllowlistControls } from './ModerationAllowlistControls';
import type { LocalHandoffUrl } from '../../desktopRuntime';
import { OverlayUrlMenu } from './OverlayUrlMenu';
import { StingerQuickMenu } from '../stingers/StingerQuickMenu';
import { HelpMenu } from '../tutorials/HelpMenu';
import type { TutorialWorkspace } from '../tutorials/tutorials';
import { Fragment, type ReactNode } from 'react';

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
  // Navigation keeps the English order in every language.
  const bracketActions: Array<{
    id: string;
    label: string;
    disabled: boolean;
    help?: string;
    testId?: string;
    onClick(): void;
  }> = [
    {
      id: 'clear',
      label: t('startgg.clearCache'),
      disabled: loading,
      testId: 'clear-startgg-cache',
      onClick: onClearCache
    },
    {
      id: 'reload',
      label: t('editor.reload'),
      disabled: reloadSelectedSetDisabled,
      help: reloadWarning ?? t(loading ? 'editor.waitAction' : 'editor.reloadHint'),
      onClick: onReloadSelectedSet
    },
    {
      id: 'refresh',
      label: t('browser.refresh'),
      disabled: loading || !setScope,
      help: t(loading ? 'editor.waitAction' : 'browser.selectEvent'),
      onClick: () => setScope && onReloadBracketData(setScope)
    }
  ];
  if (tournamentLoaded)
    bracketActions.push({
      id: 'unload',
      label: t('startgg.unloadTournament'),
      disabled: unloadTournamentDisabled,
      testId: 'unload-tournament',
      onClick: onUnloadTournament
    });
  const tools = [
    { id: 'help', content: <HelpMenu navigate={onTutorialWorkspace} /> },
    { id: 'players', content: <PlayerLibraryButton selectedSet={activeSet} compact /> },
    {
      id: 'set-selector',
      content: (
        <Button size="compact-xs" variant="default" disabled={setSelectorDisabled} onClick={onOpenSetSelector}>
          {t('selector.open')}
        </Button>
      )
    },
    { id: 'settings', content: <SettingsButton compact /> }
  ];
  const groups: Array<{ id: string; label: string; tutorial?: string; content: ReactNode }> = [
    {
      id: 'bracket',
      label: t('utilityGroups.bracket'),
      tutorial: 'bracket-options',
      content: (
        <Group className="workspace-maintenance-actions" gap="xs" wrap="nowrap">
          <Menu position="bottom-start" shadow="md" width={280}>
            <Menu.Target>
              <Button size="compact-xs" variant="default" rightSection={<span aria-hidden="true">▾</span>}>
                {t('quickTools.bracketOptions')}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {bracketActions.map((action) => (
                <Menu.Item
                  key={action.id}
                  data-testid={action.testId}
                  disabled={action.disabled}
                  onClick={action.onClick}
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
        </Group>
      )
    },
    {
      id: 'media',
      label: t('utilityGroups.media'),
      tutorial: 'assets',
      content: (
        <Group className="workspace-maintenance-actions" gap="xs" wrap="nowrap">
          <AssetsMenu game={assetCatalogSlug} />
          <Tooltip label={t('browser.reloadAssetsHint')} openDelay={350}>
            <Box component="span" display="flex">
              <Button size="compact-xs" variant="default" loading={reloadingAssets} onClick={onReloadAssets}>
                {t('browser.reloadAssets')}
              </Button>
            </Box>
          </Tooltip>
        </Group>
      )
    },
    {
      id: 'moderation',
      label: t('utilityGroups.moderation'),
      content: <ModerationAllowlistControls onApplied={onModerationApplied} />
    },
    {
      id: 'obs',
      label: t('utilityGroups.obs'),
      tutorial: 'obs',
      content: (
        <Group gap="xs" wrap="nowrap">
          <OverlayUrlMenu copied={copiedHandoff} disabled={!localBaseUrl} compact onCopy={onCopy} />
          <StingerQuickMenu activeSet={activeSet} onConfigure={onConfigureStingers} />
        </Group>
      )
    },
    {
      id: 'tools',
      label: t('quickTools.tools'),
      content: (
        <Group gap="xs" wrap="nowrap">
          {tools.map((tool) => (
            <Fragment key={tool.id}>{tool.content}</Fragment>
          ))}
        </Group>
      )
    }
  ];

  return (
    <Group className="workspace-maintenance-bar" gap="md" align="flex-end" wrap="wrap">
      {groups.map((group) => (
        <div key={group.id} className="workspace-maintenance-group" data-tutorial={group.tutorial}>
          <Text className="workspace-maintenance-label">{group.label}</Text>
          {group.content}
        </div>
      ))}
      <Switch
        className="workspace-shortcuts-toggle"
        size="xs"
        label={t('editor.enableShortcuts')}
        checked={keyboardShortcuts.enabled}
        onChange={(event) => keyboardShortcuts.setEnabled(event.currentTarget.checked)}
      />
    </Group>
  );
}
