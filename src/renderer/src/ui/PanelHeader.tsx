import { Box, Group, Text, Title, type MantineSpacing } from '@mantine/core';
import type { ReactNode } from 'react';

type PanelHeaderProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  mb?: MantineSpacing;
};

export function PanelHeader({ title, description, children, mb }: PanelHeaderProps) {
  return (
    <Box mb={mb}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Title order={2} size="h4" flex={1} miw={0} style={{ overflowWrap: 'anywhere' }}>
          {title}
        </Title>
        {children && <Box style={{ flexShrink: 0 }}>{children}</Box>}
      </Group>
      {description && (
        <Text c="dimmed" size="sm">
          {description}
        </Text>
      )}
    </Box>
  );
}
