import { Box, Group, Text, Title, getSpacing, type MantineSpacing } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';
import { IconLabel, SquaresFourIcon, type Icon } from './icons';
import './panelHeader.css';

type PanelHeaderProps = {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  mb?: MantineSpacing;
  icon?: Icon;
  order?: 2 | 3;
  size?: 'h3' | 'h4' | 'h5';
  /** Match the surrounding card padding when the header should reach its edges. */
  inset?: MantineSpacing;
  className?: string;
};

export function PanelHeader({
  title,
  description,
  children,
  mb,
  icon = SquaresFourIcon,
  order = 2,
  size,
  inset,
  className = ''
}: PanelHeaderProps) {
  const headerInset = typeof inset === 'string' && inset.startsWith('var(') ? inset : getSpacing(inset ?? 0);
  return (
    <Box
      className={`operator-section-header ${className}`}
      mb={mb}
      data-level={order}
      data-inset={inset !== undefined || undefined}
      style={{ '--section-header-inset': headerInset } as CSSProperties}
    >
      <Group justify="space-between" align="center" gap="sm" wrap="wrap">
        <Box flex={1} miw={0}>
          <Title className="operator-section-header-title" order={order} size={size ?? (order === 2 ? 'h4' : 'h5')}>
            <IconLabel icon={icon} size={order === 2 ? 18 : 16}>
              {title}
            </IconLabel>
          </Title>
          {description && (
            <Text c="dimmed" size="xs" mt={4}>
              {description}
            </Text>
          )}
        </Box>
        {children && <Box className="operator-section-header-actions">{children}</Box>}
      </Group>
    </Box>
  );
}
