import { ActionIcon, Button, Group, Paper, Stack, Text } from '@mantine/core';
import type { StartggPageInfo } from '@shared/models';
import { useTranslation } from 'react-i18next';

type QuickScoreProps = {
  label: string;
  score: number;
  maxScore: number;
  disabled: boolean;
  onChange(score: number): void;
};

export function QuickScore({ label, score, maxScore, disabled, onChange }: QuickScoreProps) {
  const { t } = useTranslation('operator');
  return (
    <Paper className="quick-score" radius="md" p="sm" withBorder>
      <Stack gap={2}>
        <Text className="quick-score-label" size="sm" fw={700}>{label}</Text>
        <Text className="quick-score-value" size="xl" fw={900}>{score}</Text>
      </Stack>
      <Group gap="xs">
        <ActionIcon
          aria-label={t('aria.decreaseScore', { player: label })}
          disabled={disabled || score === 0}
          onClick={() => onChange(score - 1)}
          size="sm"
          variant="default"
        >
          −
        </ActionIcon>
        <ActionIcon
          aria-label={t('aria.increaseScore', { player: label })}
          disabled={disabled || score >= maxScore}
          onClick={() => onChange(score + 1)}
          size="sm"
        >
          +
        </ActionIcon>
      </Group>
    </Paper>
  );
}

type PaginationControlsProps = {
  label: string;
  pageInfo: StartggPageInfo;
  disabled: boolean;
  onPage(page: number): void;
};

export function PaginationControls({ label, pageInfo, disabled, onPage }: PaginationControlsProps) {
  const { t } = useTranslation('common');
  return (
    <Group className="pagination-controls" component="nav" aria-label={label} justify="space-between">
      <Button
        disabled={disabled || pageInfo.page <= 1}
        onClick={() => onPage(pageInfo.page - 1)}
        variant="default"
      >
        {t('actions.previous')}
      </Button>
      <Text className="pagination-label" size="sm">
        {t('pagination', { page: pageInfo.page, totalPages: pageInfo.totalPages })}
      </Text>
      <Button
        disabled={disabled || pageInfo.page >= pageInfo.totalPages}
        onClick={() => onPage(pageInfo.page + 1)}
        variant="default"
      >
        {t('actions.next')}
      </Button>
    </Group>
  );
}
