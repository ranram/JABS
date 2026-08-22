import type { OverlayState } from '@shared/models';
import { parseOverlayState } from '../../../shared/overlayState';
import { parseRealtimeJson } from './realtime';

export { reconnectDelay } from './realtime';

export function parseOverlayMessage(value: unknown): OverlayState | undefined {
  return parseRealtimeJson(value, (parsed) => {
    const message = parsed as {
      event?: unknown;
      payload?: unknown;
    };
    if (message.event !== 'overlay-state') {
      return undefined;
    }
    return parseOverlayState(message.payload);
  });
}
