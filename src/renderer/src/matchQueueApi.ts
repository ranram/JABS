import { matchQueueSchema, type QueueAction, type QueueContext } from '@shared/matchQueue';
import { request, performRequest } from './api';
import { queueOperations } from './diagnosticOperations';

export type QueueHeartbeat = {
  clientId: string;
  eventId?: string;
  busy: boolean;
  sequence: number;
  preserveStation: boolean;
  preserveMatchLength: boolean;
  signal?: AbortSignal;
};

export const matchQueueApi = {
  current: () => request('/api/match-queue', undefined, { decoder: matchQueueSchema }),
  add: (revision: number, context: QueueContext, setId: string | readonly string[]) =>
    request(
      '/api/match-queue/add',
      {
        method: 'POST',
        body: JSON.stringify({ revision, context, ...(typeof setId === 'string' ? { setId } : { setIds: setId }) })
      },
      { decoder: matchQueueSchema }
    ),
  action: (revision: number, action: QueueAction) =>
    request(
      '/api/match-queue/action',
      {
        method: 'POST',
        body: JSON.stringify({ revision, ...action })
      },
      { decoder: matchQueueSchema, diagnosticOperation: queueOperations[action.action] }
    ),
  // Heartbeats must not register as pending edits themselves.
  heartbeat: ({ signal, ...heartbeat }: QueueHeartbeat) =>
    performRequest<void>('/api/match-queue/heartbeat', {
      method: 'POST',
      body: JSON.stringify(heartbeat),
      signal
    })
};
