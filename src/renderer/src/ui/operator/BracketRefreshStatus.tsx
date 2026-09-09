import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { StartggResultMeta } from '@shared/models';

export type BracketRefresh = Pick<StartggResultMeta, 'source'> & { at?: string };

export function BracketRefreshStatus({ refresh }: { refresh?: BracketRefresh }) {
  const { t, i18n } = useTranslation('operator');
  if (!refresh) return null;
  const date = refresh.at ? new Date(refresh.at) : undefined;
  const time = date && Number.isFinite(date.getTime())
    ? date.toLocaleString(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'short', timeStyle: 'short' })
    : undefined;
  return <Text size="xs" c={refresh.source === 'cache' ? 'yellow' : 'dimmed'} role="status">
    {t(refresh.source === 'cache' ? (time ? 'browser.cachedAt' : 'browser.cached') : 'browser.updatedAt', { time: time ?? '' })}
  </Text>;
}
