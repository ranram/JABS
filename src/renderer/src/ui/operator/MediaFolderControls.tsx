import { useEffect, useState } from 'react';
import { Button, Code, Group, Text, Tooltip } from '@mantine/core';
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
  /** Path within the media folder, such as `street-fighter-6/characters`. */
  subpath?: string;
};

/**
 * Show this installation's media folder. The native command checks which
 * folder to open; the displayed path is not used as a command argument.
 */
export function MediaFolderControls({ kind, label, subpath }: MediaFolderControlsProps) {
  const { t } = useTranslation('common');
  const [directories, setDirectories] = useState<MediaDirectories>();

  useEffect(() => {
    let active = true;
    void getNativeMediaDirectories()
      .then((resolved) => {
        if (active) setDirectories(resolved);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const nativeRoot = nativeMediaDirectory(directories, kind);
  const displayPath = nativeRoot ? joinMediaDisplayPath(nativeRoot, subpath) : relativeMediaHint(kind, subpath);

  return (
    <Group gap="xs" align="center" wrap="wrap" justify="space-between">
      <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0 }}>
        {label} <Code style={{ wordBreak: 'break-all' }}>{displayPath}</Code>
      </Text>
      {isTauriRuntime() && nativeRoot && (
        <Tooltip label={t('mediaFolder.openHint')} openDelay={350}>
          <Button
            size="compact-sm"
            variant="light"
            color="violet"
            onClick={() => {
              void openNativeMediaDirectory(kind, subpath).catch(() => {
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
        </Tooltip>
      )}
    </Group>
  );
}
