import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { noticeLabelKey, noticeTone } from './operatorUtils';

const toneColors = {
  error: 'red',
  warning: 'yellow',
  success: 'green',
  info: 'blue'
} as const;

export function useOperatorNotifications(message?: string, stateError?: string): void {
  const { t } = useTranslation('operator');

  useEffect(() => {
    if (!stateError) return;
    notifications.show({
      id: 'operator-connection-error',
      title: t('notices.connection'),
      message: stateError,
      color: 'red',
      autoClose: false,
      withCloseButton: true
    });
  }, [stateError, t]);

  useEffect(() => {
    if (!message) return;
    const tone = noticeTone(message);
    notifications.show({
      title: t(`notices.${noticeLabelKey(message)}`),
      message,
      color: toneColors[tone],
      autoClose: tone === 'error' ? false : 6_000,
      withCloseButton: true
    });
  }, [message, t]);
}
