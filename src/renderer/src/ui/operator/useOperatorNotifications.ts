import { useCallback, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { noticeLabels, type NoticeSink } from './operatorNotice';

const toneColors = {
  error: 'red',
  warning: 'yellow',
  success: 'green',
  info: 'blue'
} as const;

export function useOperatorNotifications(stateError?: string): NoticeSink {
  const { t } = useTranslation('operator');
  // Send feedback before the action closes its modal or switches views.
  const setMessage = useCallback<NoticeSink>(
    (message, tone) => {
      notifications.show({
        title: t(`notices.${noticeLabels[tone]}`),
        message,
        color: toneColors[tone],
        withCloseButton: true,
        autoClose: tone === 'error' ? 8000 : tone === 'warning' ? 7000 : 2500
      });
    },
    [t]
  );

  useEffect(() => {
    if (!stateError) return;
    notifications.show({
      id: 'operator-connection-error',
      title: t('notices.connection'),
      message: stateError,
      color: 'red',
      withCloseButton: true
    });
  }, [stateError, t]);

  return setMessage;
}
