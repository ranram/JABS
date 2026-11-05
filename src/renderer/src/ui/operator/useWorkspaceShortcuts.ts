import type { StingerKind, StingerPlaybackResult } from '@shared/stingers';
import { useEffect, useState } from 'react';
import type { MatchQueue } from '@shared/matchQueue';
import type { QueueController } from './matchQueueContext';
import { currentQueueIndex } from './queuePresentation';
import { hasVisiblePopup, isTypingTarget, shortcutCode } from './useScoreShortcuts';
import { isTutorialActive } from '../tutorials/tutorialActivity';

export type ShortcutConfirmationKind = 'queue' | 'players' | 'scores' | 'stinger-perfect' | 'stinger-winner';

type Options = {
  enabled: boolean;
  navigationBlocked: boolean;
  selectorAvailable: boolean;
  onOpenSelector(): void;
  onOpenPlayers?(): void;
  onPlayStinger?(kind: StingerKind): Promise<StingerPlaybackResult>;
  onConfigureStingers?(): void;
  onClearPlayers?(): void | boolean | Promise<void | boolean>;
  onResetScores?(): void | boolean | Promise<void | boolean>;
  queue?: QueueController;
};

type ReadyQueue = QueueController & { state: MatchQueue };

function canModifyQueue(queue: QueueController | undefined): queue is ReadyQueue {
  return Boolean(
    queue?.state &&
    queue.context &&
    !queue.busy &&
    !queue.blocked &&
    queue.state.status !== 'loading' &&
    queue.context.eventId === queue.state.context?.eventId
  );
}

export function useWorkspaceShortcuts({
  enabled,
  navigationBlocked,
  selectorAvailable,
  onOpenSelector,
  onOpenPlayers,
  onPlayStinger,
  onConfigureStingers,
  onClearPlayers,
  onResetScores,
  queue
}: Options) {
  const [confirmation, setConfirmation] = useState<{
    kind: ShortcutConfirmationKind;
    revision?: number;
    remoteId?: string;
  }>();
  const confirming = Boolean(confirmation);
  useEffect(() => {
    if (!confirming) return;
    // Hold once for the whole dialog; controller callbacks change on each render.
    const hold = queue?.hold;
    hold?.(true);
    return () => hold?.(false);
  }, [confirming]);
  async function confirm(): Promise<boolean> {
    if (!confirmation || navigationBlocked) return false;
    setConfirmation(undefined);
    if (confirmation.kind === 'stinger-perfect' || confirmation.kind === 'stinger-winner') {
      onConfigureStingers?.();
      return Boolean(onConfigureStingers);
    }
    if (confirmation.kind === 'players') return (await onClearPlayers?.()) !== false;
    if (confirmation.kind === 'scores') return (await onResetScores?.()) !== false;
    if (
      queue?.state &&
      !queue.busy &&
      !queue.blocked &&
      queue.state.revision === confirmation.revision &&
      queue.context?.eventId === queue.state.context?.eventId
    )
      return queue.act({ action: 'clear' });
    return false;
  }
  function requestRemoteConfirmation(kind: ShortcutConfirmationKind, remoteId: string) {
    if (confirming || navigationBlocked) return false;
    if (kind === 'queue' && (!canModifyQueue(queue) || !queue.state.entries.length)) return false;
    if (kind === 'players' && !onClearPlayers) return false;
    if (kind === 'scores' && !onResetScores) return false;
    if (kind.startsWith('stinger-') && !onConfigureStingers) return false;
    setConfirmation({ kind, revision: queue?.state?.revision, remoteId });
    return true;
  }
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      let code = shortcutCode(event);
      const launcher = !event.ctrlKey && !event.shiftKey && ['F5', 'F6', 'F7'].includes(code);
      if (launcher && code === 'F6') code = 'KeyQ';
      if (launcher && code === 'F7') code = 'KeyE';
      const alreadyHandled = event.defaultPrevented;
      const stinger = event.ctrlKey && !event.shiftKey && (code === 'KeyP' || code === 'KeyW');
      if (enabled && stinger && onPlayStinger && !event.altKey && !event.metaKey) {
        // Block the browser's print/close action even when playback is temporarily unavailable.
        event.preventDefault();
        if (
          alreadyHandled ||
          confirming ||
          event.repeat ||
          event.isComposing ||
          navigationBlocked ||
          isTutorialActive() ||
          isTypingTarget(event.target) ||
          hasVisiblePopup('[data-tutorial="queue-panel"], [data-tutorial="set-selector"]')
        )
          return;
        const kind = code === 'KeyP' ? 'perfect' : 'winner';
        void onPlayStinger(kind).then((result) => {
          if (result === 'unconfigured')
            setConfirmation(
              (current) => current ?? { kind: kind === 'perfect' ? 'stinger-perfect' : 'stinger-winner' }
            );
        });
        return;
      }
      if (enabled && launcher && code === 'F5' && !event.altKey && !event.metaKey && onOpenPlayers)
        event.preventDefault();
      if (
        !enabled ||
        confirming ||
        alreadyHandled ||
        event.repeat ||
        event.isComposing ||
        (!launcher && (!event.ctrlKey || !event.shiftKey)) ||
        event.altKey ||
        event.metaKey ||
        isTutorialActive()
      )
        return;
      if (!['F5', 'KeyQ', 'KeyE', 'KeyN', 'KeyP', 'Space', 'KeyD', 'KeyX'].includes(code)) return;
      if (hasVisiblePopup('[data-tutorial="queue-panel"], [data-tutorial="set-selector"]')) return;
      if (isTypingTarget(event.target) && code !== 'F5' && code !== 'KeyQ' && code !== 'KeyE') return;
      if (code === 'F5' && launcher && onOpenPlayers) {
        event.preventDefault();
        onOpenPlayers();
      } else if (code === 'KeyD' && !navigationBlocked && canModifyQueue(queue) && queue.state.entries.length) {
        event.preventDefault();
        setConfirmation({ kind: 'queue', revision: queue.state.revision });
      } else if (code === 'KeyX' && onClearPlayers && !navigationBlocked) {
        event.preventDefault();
        setConfirmation({ kind: 'players' });
      } else if (code === 'KeyQ' && queue) {
        event.preventDefault();
        queue.open();
      } else if (code === 'KeyE' && selectorAvailable) {
        event.preventDefault();
        onOpenSelector();
      } else if (code === 'Space' && queue?.state) {
        const state = queue.state;
        if (queue.busy) return;
        if (
          !state.running &&
          (navigationBlocked || !canModifyQueue(queue) || state.mode === 'manual' || state.cursor === null)
        )
          return;
        event.preventDefault();
        void queue.act({ action: state.running ? 'pause' : 'resume' });
      } else if ((code === 'KeyN' || code === 'KeyP') && queue?.state) {
        const state = queue.state;
        if (navigationBlocked || !canModifyQueue(queue)) return;
        const index = currentQueueIndex(state, queue.liveSetId);
        const previous = code === 'KeyP';
        if (
          previous
            ? index === null || index === 0
            : !state.entries.length || (index !== null && index >= state.entries.length - 1)
        )
          return;
        event.preventDefault();
        void queue.act({ action: previous ? 'previous' : 'next' });
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    enabled,
    navigationBlocked,
    selectorAvailable,
    onOpenSelector,
    onOpenPlayers,
    onClearPlayers,
    onPlayStinger,
    queue,
    confirming
  ]);
  return {
    confirmation: confirmation?.kind,
    confirmationId: confirmation?.remoteId,
    requestRemoteConfirmation,
    confirm,
    cancel: () => setConfirmation(undefined)
  };
}
