import { useEffect, useState } from 'react';
import { Button, Code, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import {
  getNativeMediaDirectories,
  isTauriRuntime,
  nativeMediaDirectory,
  openNativeMediaDirectory,
  type MediaDirectoryKind,
  type MediaDirectories
} from '../../desktopRuntime';
import { joinMediaDisplayPath, relativeMediaHint } from '../../mediaFolders';

type MediaFolderControlsProps = {
  kind: MediaDirectoryKind;
  label: string;
  /** Repository-relative subpath shown inside the catalog, such as `street-fighter-6/characters`. */
  subpath?: string;
};

/**
 * Shows where JABS actually reads a user-media catalog and offers to open it
 * in the platform file manager. Packaged builds keep these catalogs inside
 * JABS's application-data directory, which users otherwise cannot find; the
 * resolved path is display-only and every catalog read still goes through the
 * native validated routes.
 */
export function MediaFolderControls({ kind, label, subpath }: MediaFolderControlsProps) {
  const { t } = useTranslation('common');
  const [directories, setDirectories] = useState<MediaDirectories>();

  useEffect(() => {
    let active = true;
    void getNativeMediaDirectories().then((resolved) => {
      if (active) setDirectories(resolved);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const nativeRoot = nativeMediaDirectory(directories, kind);
  const displayPath = nativeRoot ? joinMediaDisplayPath(nativeRoot, subpath) : relativeMediaHint(kind, subpath);

  return (
    <Group gap="xs" align="center" wrap="wrap" justify="space-between">
      <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0 }}>
        {label} <Code style={{ wordBreak: 'break-all' }}>{displayPath}</Code>
      </Text>
      {isTauriRuntime() && nativeRoot && (
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() => {
            void openNativeMediaDirectory(kind).catch(() => {
              notifications.show({
                message: t('mediaFolder.openFailed'),
                color: 'red',
                withCloseButton: true
              });
            });
          }}
        >
          {t('mediaFolder.open')}
        </Button>
      )}
    </Group>
  );
}
