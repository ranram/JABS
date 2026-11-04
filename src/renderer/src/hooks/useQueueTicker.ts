import { queueTickerSnapshotSchema, type QueueTickerSettings } from '@shared/queueTicker';
import { request } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

export const queueTickerApi = {
  current: () => request('/api/broadcast/queue-ticker', undefined, { decoder: queueTickerSnapshotSchema }),
  update: (settings: QueueTickerSettings) =>
    request(
      '/api/broadcast/queue-ticker',
      {
        method: 'PUT',
        body: JSON.stringify(settings)
      },
      { decoder: queueTickerSnapshotSchema }
    )
};
const parseMessage = (value: unknown) =>
  parseRealtimeJson(value, (message) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('event' in message) ||
      message.event !== 'queue-ticker' ||
      !('payload' in message)
    )
      return undefined;
    const result = queueTickerSnapshotSchema.safeParse(message.payload);
    return result.success ? result.data : undefined;
  });
export function useQueueTicker() {
  return useRealtimeState({ load: queueTickerApi.current, parseMessage, loadError: 'Unable to load queue ticker.' });
}
