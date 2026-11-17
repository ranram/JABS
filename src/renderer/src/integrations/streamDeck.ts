import { listen } from '@tauri-apps/api/event';
import { invokeNative } from '../nativeCommand';
import { streamDeckCommandSchema, type StreamDeckCommand, type StreamDeckResult } from '@shared/streamDeck';

export function listenForStreamDeck(execute: (command: StreamDeckCommand) => Promise<StreamDeckResult>) {
  return listen('stream-deck-command', async ({ payload }) => {
    const parsed = streamDeckCommandSchema.safeParse(payload);
    if (!parsed.success) return;
    let outcome: StreamDeckResult = 'failed';
    try {
      outcome = Date.now() <= parsed.data.expiresAt ? await execute(parsed.data) : 'blocked';
    } catch {
      /* Failure details remain inside JABS, never in the external protocol. */
    }
    await invokeNative<void>('stream_deck_ack', { id: parsed.data.id, outcome }).catch(() => undefined);
  });
}
