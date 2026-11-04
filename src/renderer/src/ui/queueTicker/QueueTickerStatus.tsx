import { Badge, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useQueueTicker } from '../../hooks/useQueueTicker';

export function QueueTickerStatus() {
  const { t } = useTranslation('operator');
  const { state, error } = useQueueTicker();
  if (!state || error) return null;
  const { enabled, upcomingCount, showResults } = state.settings;
  return (
    <Group gap="xs" justify="flex-end" wrap="nowrap" miw={0}>
      <Badge style={{ flexShrink: 0 }} color={enabled ? 'teal' : 'gray'} variant="light">
        {t(enabled ? 'queueTicker.on' : 'queueTicker.off')}
      </Badge>
      <Text size="sm" c="dimmed" truncate="end">
        {t('queueTicker.upcomingStatus', { count: state.upcoming.length, limit: upcomingCount })}
        {showResults && <> · {t('queueTicker.resultsStatus', { count: state.results.length })}</>}
      </Text>
    </Group>
  );
}
