import { Divider, Group, Kbd, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function MediaControlHint({ showOverlapSelection = false }: { showOverlapSelection?: boolean }) {
  const { t } = useTranslation('operator');
  return <Group gap="sm" wrap="wrap">
    <Text c="dimmed" size="xs">{t('mediaControls.pointer')}</Text>
    {showOverlapSelection && <ControlInstruction>
      <Kbd>Alt</Kbd><Text c="dimmed" size="xs">+</Text><Kbd>{t('mediaControls.click')}</Kbd>
      <Text c="dimmed" size="xs">{t('mediaControls.combinedEditingHelp')}</Text>
    </ControlInstruction>}
    <ControlInstruction><Kbd>← ↑ ↓ →</Kbd><Text c="dimmed" size="xs">{t('mediaControls.move')}</Text></ControlInstruction>
    <ControlInstruction><Kbd>Shift</Kbd><Text c="dimmed" size="xs">+</Text><Kbd>← ↑ ↓ →</Kbd><Text c="dimmed" size="xs">{t('mediaControls.moveFarther')}</Text></ControlInstruction>
    <ControlInstruction><Kbd>+ / −</Kbd><Text c="dimmed" size="xs">{t('mediaControls.resize')}</Text></ControlInstruction>
    <ControlInstruction><Kbd>F</Kbd><Text c="dimmed" size="xs">{t('mediaControls.flip')}</Text></ControlInstruction>
  </Group>;
}

function ControlInstruction({ children }: { children: React.ReactNode }) {
  return <Group gap={6} wrap="nowrap">
    <Divider orientation="vertical" h={20} />
    {children}
  </Group>;
}
