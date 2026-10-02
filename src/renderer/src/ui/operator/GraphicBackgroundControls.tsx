import { useRef, useState } from 'react';
import { Button, FileButton, Group, Paper, SimpleGrid, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import type { GraphicBackground } from '@shared/models';
import { readGraphicBackground } from './graphicBackground';

export function GraphicBackgroundControls({
  value,
  onChange
}: {
  value?: GraphicBackground;
  onChange(background?: GraphicBackground): void;
}) {
  const { t } = useTranslation('operator');
  const resetRef = useRef<() => void>(null);
  const [loading, setLoading] = useState(false);

  async function chooseImage(file: File | null) {
    if (!file) return;
    setLoading(true);
    try {
      onChange({ dataUrl: await readGraphicBackground(file), name: file.name });
    } catch {
      notifications.show({
        title: t('notices.actionFailed'),
        message: t('graphicBackground.failed'),
        color: 'red',
        autoClose: false,
        withCloseButton: true
      });
    } finally {
      setLoading(false);
      resetRef.current?.();
    }
  }

  return (
    <Paper mt="md" p="sm" radius="md" withBorder>
      <Text fw={700} size="sm">
        {t('graphicBackground.title')}
      </Text>
      <Text c="dimmed" size="xs" mb="sm">
        {t('graphicBackground.hint')}
      </Text>
      <SimpleGrid type="container" cols={{ base: 1, '38rem': 2 }}>
        <Group align="flex-end">
          <FileButton
            resetRef={resetRef}
            disabled={loading}
            onChange={(file) => void chooseImage(file)}
            accept="image/png,image/jpeg,image/webp"
          >
            {(props) => (
              <Button {...props} loading={loading} variant="default">
                {t('graphicBackground.choose')}
              </Button>
            )}
          </FileButton>
          <Button
            variant="subtle"
            disabled={!value || loading}
            onClick={() => {
              onChange(undefined);
              resetRef.current?.();
            }}
          >
            {t('graphicBackground.remove')}
          </Button>
        </Group>
        <Text size="sm" c={value ? undefined : 'dimmed'}>
          {value?.name ?? t('graphicBackground.none')}
        </Text>
      </SimpleGrid>
    </Paper>
  );
}
