import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SelectedSetState } from '@shared/models';
import { playerLabel } from '@shared/playerLibrary';
import { api } from '../../api';
import { beginPendingWrite } from '../../pendingWrites';
import {
  applyStreamPlayerDefaults,
  mergeStreamPlayerDefaults,
  streamPlayerDefaults,
  type StreamPlayerDefaults
} from '../players/streamPlayerDefaults';
import type { NoticeSink } from './operatorNotice';

const defaultsSaveDelayMs = 400;

type PendingDefaults = { edits: StreamPlayerDefaults; failed: boolean };

/** Save library preferences for the player and game that were active when the edit was made. */
export function usePlayerDefaultsAutosave(
  draft: SelectedSetState | undefined,
  onPatch: (patch: Partial<SelectedSetState>) => void,
  notify: NoticeSink
) {
  const { t } = useTranslation('operator');
  const latest = useRef({ draft, onPatch, notify, t });
  latest.current = { draft, onPatch, notify, t };
  const model = useRef({
    pending: new Map<string, PendingDefaults>(),
    running: undefined as Promise<void> | undefined,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    finishWrite: undefined as (() => void) | undefined
  });

  const trackWrites = useCallback(() => {
    const current = model.current;
    const pending = current.running || [...current.pending.values()].some((item) => !item.failed);
    if (pending && !current.finishWrite) current.finishWrite = beginPendingWrite();
    if (!pending && current.finishWrite) {
      current.finishWrite();
      current.finishWrite = undefined;
    }
  }, []);

  const flush = useCallback(async () => {
    const current = model.current;
    clearTimeout(current.timer);
    if (current.running) return current.running;
    async function drain() {
      let next: [string, PendingDefaults] | undefined;
      while ((next = [...current.pending.entries()].find(([, item]) => !item.failed))) {
        const [key, { edits }] = next;
        current.pending.delete(key);
        try {
          let id = edits.identity.localPlayerId;
          if (!id) {
            const [resolved] = await api.resolvePlayers([edits.identity], edits.gameKey);
            id = resolved?.localPlayerId;
          }
          if (!id) throw new Error(latest.current.t('players.defaultsUnlinked'));
          // Read the current version so photo framing, library edits and other game defaults survive.
          const record = await api.libraryPlayer(id);
          if (edits.identity.playerId && record.playerId !== edits.identity.playerId)
            throw new Error(latest.current.t('players.defaultsIdentityChanged'));
          const saved = await api.saveLibraryPlayer(applyStreamPlayerDefaults(record, edits));
          latest.current.notify(
            latest.current.t(saved.warnings.length ? 'players.defaultsModerated' : 'players.defaultsSaved', {
              name: playerLabel(saved.player)
            }),
            saved.warnings.length ? 'warning' : 'success'
          );
        } catch (error) {
          const newer = current.pending.get(key);
          current.pending.set(key, {
            edits: newer ? mergeStreamPlayerDefaults(edits, newer.edits) : edits,
            failed: !newer
          });
          latest.current.notify(
            `${latest.current.t('players.defaultsSaveFailed', { name: edits.name })}${error instanceof Error ? ` ${error.message}` : ''}`,
            'error'
          );
        }
      }
    }
    const running = drain();
    current.running = running;
    trackWrites();
    try {
      await running;
    } finally {
      if (current.running === running) current.running = undefined;
      trackWrites();
    }
  }, [trackWrites]);

  useEffect(
    () => () => {
      void flush();
    },
    [flush]
  );

  const patch = useCallback(
    (change: Partial<SelectedSetState>) => {
      const before = latest.current.draft;
      latest.current.onPatch(change);
      if (!before) return;
      for (const side of ['playerOne', 'playerTwo'] as const) {
        const after = change[side];
        if (!after) continue;
        const edits = streamPlayerDefaults(before[side], after, before.assetCatalogSlug ?? before.gameId);
        if (!edits) continue;
        const current = model.current;
        // Group pending edits by player, even if the player swaps sides or the game changes.
        const key = JSON.stringify(edits.identity);
        const pending = current.pending.get(key);
        current.pending.set(key, {
          edits: pending ? mergeStreamPlayerDefaults(pending.edits, edits) : edits,
          failed: false
        });
        clearTimeout(current.timer);
        current.timer = setTimeout(() => void flush(), defaultsSaveDelayMs);
        trackWrites();
      }
    },
    [flush, trackWrites]
  );
  return { patch, flush };
}
