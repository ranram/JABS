import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { noticeLabels, type NoticeSink, type OperatorNotice } from './operatorNotice';

const toneColors = {
  error: 'red',
  warning: 'yellow',
  success: 'green',
  info: 'blue'
} as const;

export function useOperatorNotifications(stateError?: string): NoticeSink {
  const { t } = useTranslation('operator');
  const [notice, setNotice] = useState<OperatorNotice>();
  const setMessage = useCallback<NoticeSink>((message, tone) => {
    setNotice(message === undefined ? undefined : { message, tone });
  }, []);

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
    if (!notice) return;
    const { message, tone } = notice;
    notifications.show({
      title: t(`notices.${noticeLabels[tone]}`),
      message,
      color: toneColors[tone],
      autoClose: tone === 'error' ? false : 6_000,
      withCloseButton: true
    });
  }, [notice, t]);
  return setMessage;
}
