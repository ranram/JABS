import { Button, Group, Menu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { isTauriRuntime, openNativeMediaDirectory, type MediaDirectoryKind } from '../../desktopRuntime';

export function AssetsMenu({ game }: { game?: string }) {
  const { t } = useTranslation('operator');
  async function open(kind: MediaDirectoryKind, subpath?: string) {
    try {
      await openNativeMediaDirectory(kind, subpath);
    } catch {
      notifications.show({ message: t('quickTools.folderFailed'), color: 'red' });
    }
  }
  // Keep the English menu order as labels are translated.
  const folders: Array<{ kind: MediaDirectoryKind; label: string; subpath?: string }> = [
    { kind: 'game-assets', label: t('quickTools.characters'), subpath: game ? `${game}/characters` : undefined },
    ...(game ? [{ kind: 'game-assets' as const, label: t('quickTools.portraits'), subpath: `${game}/portraits` }] : []),
    { kind: 'player_headshots', label: t('quickTools.headshots') },
    { kind: 'players', label: t('quickTools.playerPhotos') },
    { kind: 'sponsors', label: t('quickTools.sponsors') },
    { kind: 'tourney-logos', label: t('quickTools.logos') }
  ];
  return (
    <Group gap={2} wrap="nowrap">
      <Button size="compact-xs" variant="default" disabled={!isTauriRuntime()} onClick={() => void open('assets')}>
        {t('quickTools.assets')}
      </Button>
      <Menu position="bottom-start" shadow="md">
        <Menu.Target>
          <Button size="compact-xs" variant="default" disabled={!isTauriRuntime()} aria-label={t('quickTools.folders')}>
            ▾
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {folders.map((folder) => (
            <Menu.Item key={folder.label} onClick={() => void open(folder.kind, folder.subpath)}>
              {folder.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
