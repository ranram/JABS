import { Button, Menu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { isTauriRuntime, openNativeMediaDirectory, type MediaDirectoryKind } from '../../desktopRuntime';
import { OperatorIcon, FolderOpenIcon, ArrowsClockwiseIcon } from '../icons';
import { useTutorialActive } from '../tutorials/tutorialActivity';

export function AssetsMenu({
  game,
  reloading = false,
  onReload
}: {
  game?: string;
  reloading?: boolean;
  onReload?(): void;
}) {
  const { t } = useTranslation('operator');
  const tutorialActive = useTutorialActive();
  async function open(kind: MediaDirectoryKind, subpath?: string) {
    try {
      await openNativeMediaDirectory(kind, subpath);
    } catch {
      notifications.show({ message: t('quickTools.folderFailed'), color: 'red' });
    }
  }
  // Folder order stays the same in every interface language.
  const folders: Array<{ kind: MediaDirectoryKind; label: string; subpath?: string }> = [
    { kind: 'game-assets', label: t('quickTools.characters'), subpath: game ? `${game}/characters` : undefined },
    ...(game ? [{ kind: 'game-assets' as const, label: t('quickTools.portraits'), subpath: `${game}/portraits` }] : []),
    { kind: 'player_headshots', label: t('quickTools.headshots') },
    { kind: 'players', label: t('quickTools.playerPhotos') },
    { kind: 'sponsors', label: t('quickTools.sponsors') },
    { kind: 'tourney-logos', label: t('quickTools.logos') }
  ];
  return (
    <Menu
      position="bottom-start"
      shadow="md"
      width={280}
      trapFocus={!tutorialActive}
      closeOnClickOutside={!tutorialActive}
    >
      <Menu.Target>
        <Button
          data-tutorial="assets-menu"
          size="compact-xs"
          variant="default"
          leftSection={<OperatorIcon icon={FolderOpenIcon} size={14} />}
          rightSection={<span aria-hidden="true">▾</span>}
        >
          {t('utilityGroups.media')}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          disabled={!isTauriRuntime()}
          onClick={() => void open('assets')}
          leftSection={<OperatorIcon icon={FolderOpenIcon} />}
        >
          {t('quickTools.assets')}
        </Menu.Item>
        {onReload && (
          <Menu.Item
            data-tutorial="reload-assets"
            disabled={reloading}
            onClick={onReload}
            leftSection={<OperatorIcon icon={ArrowsClockwiseIcon} />}
          >
            {t('browser.reloadAssets')}
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Label>{t('quickTools.folders')}</Menu.Label>
        {folders.map((folder) => (
          <Menu.Item
            key={folder.label}
            leftSection={<OperatorIcon icon={FolderOpenIcon} />}
            disabled={!isTauriRuntime()}
            onClick={() => void open(folder.kind, folder.subpath)}
          >
            {folder.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
