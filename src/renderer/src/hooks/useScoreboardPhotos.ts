import { z } from 'zod';
import { scoreboardPhotoSettingsSchema } from '@shared/scoreboardPhotos';
import { api } from '../api';
import { parseRealtimeJson } from './realtime';
import { useRealtimeState } from './useRealtimeState';

const messageSchema = z.object({ event: z.literal('scoreboard-photos'), payload: scoreboardPhotoSettingsSchema });
const parseMessage = (value: unknown) =>
  parseRealtimeJson(value, (payload) => {
    const parsed = messageSchema.safeParse(payload);
    return parsed.success ? parsed.data.payload : undefined;
  });
export function useScoreboardPhotos() {
  return useRealtimeState({
    load: api.scoreboardPhotoSettings,
    diagnosticOperation: 'scoreboard-photos',
    parseMessage,
    loadError: 'Unable to load scoreboard photo settings.'
  });
}
