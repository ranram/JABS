import { parseTopEightMatchupsRealtime } from '@shared/topEightMatchups';
import { api } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';
import { useTranslation } from 'react-i18next';

const parseMessage = (value: unknown) => parseRealtimeJson(value, parseTopEightMatchupsRealtime);

export function useTopEightMatchupsState() {
  const { t } = useTranslation('operator');
  return useRealtimeState({
    load: api.topEightMatchupsState,
    parseMessage,
    loadError: t('topEightMatchups.unavailable')
  });
}
