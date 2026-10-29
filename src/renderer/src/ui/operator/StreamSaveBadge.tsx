import { Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { StreamSaveStatus } from './streamStatus';

export function StreamSaveBadge({ status }: { status: StreamSaveStatus }) {
  const { t } = useTranslation('operator');
  return (
    <Badge
      className="stream-save-badge"
      variant="light"
      color={status === 'blocked' ? 'red' : status === 'saved' ? 'teal' : 'yellow'}
    >
      {t(`ux.save.${status}`)}
    </Badge>
  );
}
